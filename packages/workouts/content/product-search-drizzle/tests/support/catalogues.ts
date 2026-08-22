import { createWorkspace, type Workspace } from '../../src/server/db';
import { products } from '../../src/server/schema';
import type { SearchQuery, SearchResult } from '../../src/server/products';

/**
 * Catalogues nobody wrote, for the fifth checkpoint.
 *
 * The other four search a catalogue whose two searchable columns always agree
 * about which of them is doing the work. Every term they use hits names or SKUs
 * but never a different row through each, every SKU match is a prefix, every
 * SKU is bare uppercase, and both characters that mean something to LIKE sit in
 * a name. So an implementation that treats the two columns differently, in its
 * escaping, its case folding, its anchoring or its counting, is invisible.
 * These catalogues pull the two apart: the metacharacters are on the SKU side,
 * SKUs carry mixed case and hide their token in the middle, and a term can
 * match one row by name and a different one by SKU.
 *
 * **There is an oracle here, and it is only half of one.** Whether a row
 * matches is a substring test, which JavaScript can answer, so ADR-0167 named
 * this the second workout after `json-parser` where a differential is honest.
 * Paging, ordering and counting have no oracle and are read off a trace of the
 * walk, the way every other generated checkpoint does it.
 *
 * Two fences make the oracle sound. Everything generated is ASCII, because
 * Postgres and `toLowerCase()` disagree on `'İ'`. And names are lowercase
 * alphanumeric with no spaces, so that comparing them in JavaScript agrees with
 * `ORDER BY name` whatever collation the database was built with.
 *
 * Everything is seeded. Nothing calls `Math.random`, so a failure reproduces on
 * the next run and on someone else's machine.
 */

type Search = (workspace: Workspace, query: SearchQuery) => Promise<SearchResult>;

interface Row {
  name: string;
  sku: string;
  priceCents: number;
}

export interface Catalogue {
  seed: number;
  rows: Row[];
  term: string;
  limit: number;
}

/** One page, as it came back. */
interface Page {
  page: number;
  ids: number[];
  names: string[];
  total: number;
}

interface Trace {
  pages: Page[];
  /** The walk hit its budget with the total still promising more pages. */
  ranOut: boolean;
  /** id → the row as it went in, for anything the rules need to quote. */
  byId: Map<number, Row>;
}

/** mulberry32: small, seeded, and identical everywhere `Math.imul` is. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(next: () => number, items: readonly T[]): T {
  return items[Math.floor(next() * items.length)] as T;
}

// Names are lowercase alphanumeric so JavaScript and the database agree on
// their order. Everything awkward lives in the SKU, which nothing sorts on.
const NAME_STEMS = ['widget', 'cable', 'tee', 'box', 'lamp', 'refill', 'bracket'] as const;
// The same words in other shapes, so a term can find a name on one row and a
// SKU on another. Mixed case is what catches a fold applied to one column only.
const SKU_STEMS = ['Wdg', 'CaB', 'tEe', 'bOx', 'LmP', 'rFl', 'BrK'] as const;
// The three characters LIKE reads as instructions, in the column the
// hand-written checkpoints never put them in.
const SKU_ODDITIES = ['%', '_', '\\', '%_'] as const;
const LIMITS = [2, 2, 3, 4, 5, 7] as const;

function makeRows(next: () => number, count: number): Row[] {
  const rows: Row[] = [];
  // A block of rows sharing a name, so an ordering with nothing to fall back on
  // has somewhere to go wrong. Their SKUs stay distinct: a catalogue with two
  // rows under one stock code is a data fault rather than an interleaving, and
  // accusing a submission that tie-broke on `sku` over one would be a gotcha.
  const tiedName = pick(next, NAME_STEMS);
  const tied = 2 + Math.floor(next() * 3);

  for (let index = 0; index < count; index += 1) {
    const shared = index < tied;
    const stem = shared ? tiedName : pick(next, NAME_STEMS);
    const name = shared ? stem : `${stem}${Math.floor(next() * 90) + 10}`;
    const oddity = next() < 0.45 ? pick(next, SKU_ODDITIES) : '';
    // The stem sits in the middle, because a SKU searched from the front is
    // what makes a prefix match look like a substring match.
    const sku = `${String.fromCharCode(97 + index)}${oddity}-${pick(next, SKU_STEMS)}-${index}`;
    // The tied block shares a price as well as a name, which is what a line of
    // one product in several sizes looks like. A tie-break has to be something
    // that is actually unique, and price is the near miss worth generating.
    rows.push({ name, sku, priceCents: shared ? 900 : 100 + index * 25 });
  }
  return rows;
}

function makeTerm(next: () => number, rows: Row[]): string {
  const roll = next();
  if (roll < 0.08) return pick(next, ['', '   ', '\t']);
  if (roll < 0.16) return 'kryptonite';
  if (roll < 0.3) return pick(next, SKU_ODDITIES);

  // A slice of something that is really in there, which is what a person
  // searching a catalogue actually types.
  const sliceOf = (): string => {
    const row = pick(next, rows);
    const source = next() < 0.5 ? row.name : row.sku;
    const length = 1 + Math.floor(next() * Math.min(5, source.length));
    const start = Math.floor(next() * (source.length - length + 1));
    const slice = source.slice(start, start + length);
    return next() < 0.35 ? slice.toUpperCase() : slice;
  };

  const slice = sliceOf();
  // Two words, because a search box that quietly turns them into two conditions
  // finds rows the text the user typed is nowhere in.
  if (roll < 0.42) return `${slice} ${sliceOf()}`;
  // A stray space either side, which a search box gets constantly.
  if (roll < 0.52) return next() < 0.5 ? ` ${slice}` : `${slice} `;
  return slice;
}

export function generateCatalogues(seed: number, count: number): Catalogue[] {
  const next = random(seed);
  const catalogues: Catalogue[] = [];

  // No forced prefix, which is worth a sentence because every other generated
  // checkpoint here needs one. A term that finds one product by name and a
  // different one by SKU costs one catalogue to reach on one of these seeds and
  // four on the other, because terms are cut out of the rows themselves and the
  // two columns are built from different spellings of the same words. The bias
  // is in how a term is made rather than in a block of scenarios in front.
  while (catalogues.length < count) {
    const rows = makeRows(next, 6 + Math.floor(next() * 11));
    catalogues.push({ seed, rows, term: makeTerm(next, rows), limit: pick(next, LIMITS) });
  }
  return catalogues;
}

/** The half of this that JavaScript is allowed to answer. */
function matches(row: Row, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (needle.length === 0) return true;
  return row.name.toLowerCase().includes(needle) || row.sku.toLowerCase().includes(needle);
}

let shared: Workspace | null = null;

/**
 * One workspace for every catalogue. Booting PGlite costs the better part of a
 * second and seeding a dozen rows costs a third of a millisecond, so a fresh one
 * per catalogue would spend the whole checkpoint starting databases.
 */
async function workspace(): Promise<Workspace> {
  shared ??= await createWorkspace();
  return shared;
}

export async function closeCatalogues(): Promise<void> {
  await shared?.close();
  shared = null;
}

async function walk(catalogue: Catalogue, search: Search): Promise<Trace> {
  const space = await workspace();
  await space.db.delete(products);
  const inserted = await space.db
    .insert(products)
    .values(catalogue.rows)
    .returning({ id: products.id });
  space.queries.length = 0;

  const byId = new Map<number, Row>();
  inserted.forEach((row, index) => {
    const source = catalogue.rows[index];
    if (source) byId.set(row.id, source);
  });

  const pages: Page[] = [];
  // A walk follows the total it was given, because that is what a page control
  // does with it. The budget is only here to stop a wrong one running away.
  let budget = Math.ceil(catalogue.rows.length / catalogue.limit) + 3;
  let ranOut = false;

  for (let page = 1; ; page += 1) {
    const result = await search(space, { q: catalogue.term, page, limit: catalogue.limit });
    pages.push({
      page,
      ids: result.items.map((item) => item.id),
      names: result.items.map((item) => item.name),
      total: result.total,
    });

    const claimed = Number.isFinite(result.total) ? Math.ceil(result.total / catalogue.limit) : 1;
    if (page >= Math.max(claimed, 1)) break;
    budget -= 1;
    if (budget <= 0) {
      ranOut = true;
      break;
    }
  }

  return { pages, ranOut, byId };
}

/**
 * The rules, each a sentence. Three of them are liveness rules and they are the
 * half nobody writes by hand: a search that under-reports its total, or drops a
 * row on the floor between two pages, leaves nothing a safety rule can see.
 */
function violation(catalogue: Catalogue, trace: Trace): string | null {
  const { term, limit } = catalogue;
  const expected = [...trace.byId.entries()].filter(([, row]) => matches(row, term));
  const seen = new Map<number, number[]>();

  for (const page of trace.pages) {
    if (page.ids.length > limit) {
      return `page ${page.page} came back with ${page.ids.length} products for a limit of ${limit}. A page is never longer than the page size it was asked for.`;
    }

    const first = trace.pages[0];
    if (first && page.total !== first.total) {
      return `the same search reported a total of ${first.total} on page 1 and ${page.total} on page ${page.page}. The total is a property of the search, not of the page it came back with.`;
    }

    for (const id of page.ids) {
      const row = trace.byId.get(id);
      if (!row)
        return `page ${page.page} handed over a product id ${id} that is not in the catalogue.`;
      if (!matches(row, term)) {
        return `page ${page.page} handed over "${row.name}" (sku "${row.sku}") for a search of "${term}", and neither its name nor its SKU contains that text. What somebody types into a search box is text, not a pattern.`;
      }
      const on = seen.get(id) ?? [];
      on.push(page.page);
      seen.set(id, on);
      if (on.length > 1) {
        return `"${row.name}" (sku "${row.sku}") came back on page ${on.join(' and page ')}. Walking the pages has to visit every product exactly once.`;
      }
    }
  }

  const order = trace.pages.flatMap((page) => page.names);
  for (let index = 1; index < order.length; index += 1) {
    const previous = order[index - 1] as string;
    const current = order[index] as string;
    if (previous > current) {
      return `walking the pages put "${previous}" before "${current}", which is the wrong way round. The results are ordered by name, and that holds across a page boundary as well as inside one.`;
    }
  }

  const total = trace.pages[0]?.total ?? 0;
  if (total !== expected.length) {
    return `the search for "${term}" reported a total of ${total}, and ${expected.length} product(s) actually match it. The total is the number of matches, and it is what decides how many pages there are.`;
  }

  for (const [id, row] of expected) {
    if (seen.has(id)) continue;
    return `"${row.name}" (sku "${row.sku}") matches "${term}" and was on no page at all. A product that cannot be reached by paging through the results is one nobody will ever find.`;
  }

  if (trace.ranOut) {
    return `the walk read ${trace.pages.length} pages of ${limit} over a catalogue of ${catalogue.rows.length} and the total still said there was more to come. Paging through the matches has to run out.`;
  }

  return null;
}

async function check(catalogue: Catalogue, search: Search): Promise<string | null> {
  try {
    return violation(catalogue, await walk(catalogue, search));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const SHRINK_BUDGET = 120;

/** Delta debugging over the rows, then the term, then the page size. Every
 *  accepted cut shortens the catalogue, so this terminates on its own; the
 *  budget is there to bound a slow submission. */
async function shrink(catalogue: Catalogue, search: Search): Promise<Catalogue> {
  let best = catalogue;
  let spent = 0;

  for (let block = Math.max(1, best.rows.length >> 1); block >= 1; block >>= 1) {
    let from = 0;
    while (from + block <= best.rows.length && spent < SHRINK_BUDGET) {
      spent += 1;
      const rows = [...best.rows.slice(0, from), ...best.rows.slice(from + block)];
      const candidate = { ...best, rows };
      if (rows.length > 0 && (await check(candidate, search))) best = candidate;
      else from += 1;
    }
  }

  for (let cut = best.term.length - 1; cut >= 1 && spent < SHRINK_BUDGET; cut -= 1) {
    spent += 1;
    const candidate = { ...best, term: best.term.slice(0, cut) };
    if (await check(candidate, search)) best = candidate;
    else break;
  }

  for (const limit of LIMITS) {
    if (spent >= SHRINK_BUDGET || limit >= best.limit) continue;
    spent += 1;
    const candidate = { ...best, limit };
    if (await check(candidate, search)) best = candidate;
  }

  return best;
}

/**
 * Six non-blank lines reach the panel, so the rule goes first and the catalogue
 * is what gets cut. The rows are one line for the same reason.
 */
function report(catalogue: Catalogue, message: string): string {
  return [
    message,
    `search "${catalogue.term}", ${catalogue.limit} per page, ${catalogue.rows.length} product(s), seed ${catalogue.seed}`,
    catalogue.rows.map((row) => `${row.name} / ${row.sku}`).join(' · '),
  ].join('\n\n');
}

export async function firstViolation(
  catalogues: Catalogue[],
  search: Search
): Promise<string | null> {
  for (const catalogue of catalogues) {
    const message = await check(catalogue, search);
    if (!message) continue;
    const smallest = await shrink(catalogue, search);
    return report(smallest, (await check(smallest, search)) ?? message);
  }
  return null;
}
