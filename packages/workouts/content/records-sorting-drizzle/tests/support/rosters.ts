import { createDb, type Db, employees } from '../../src/server/db';
import type { ListQuery, ListResult, SortColumn, SortDirection } from '../../src/server/employees';

/**
 * Rosters nobody wrote, for the fifth checkpoint.
 *
 * The other four walk the pages exactly once, and they do it in the one
 * configuration where paging cannot go wrong: ascending, over a column whose
 * twelve values are all different and never null, at a page size that divides
 * twelve exactly, stopping on the last full page. Two of the four sortable
 * columns are never sorted on at all, and one of those is the nullable one.
 * These rosters move all of it: either direction, every column, ties, nulls,
 * and a page size chosen not to divide the roster.
 *
 * There is no second implementation of `listEmployees` in here. The rules below
 * are read off a trace of the walk, which is why a failure names the rule that
 * broke rather than a row that came out somewhere else.
 *
 * Two fences keep the rules honest. Every generated string is single-case
 * ASCII, so comparing keys in JavaScript agrees with SQLite's `BINARY`
 * collation and a submission that reached for `COLLATE NOCASE` is not accused
 * of anything. And rows whose sort key is null are skipped by the ordering rule
 * rather than expected at one end, because the brief puts `nullsLast` under
 * "if you finish early" and either placement is allowed.
 *
 * Everything is seeded. Nothing calls `Math.random`, so a failure reproduces on
 * the next run and on someone else's machine.
 */

type List = (db: Db, query: ListQuery) => ListResult;

interface Row {
  name: string;
  department: string;
  salary: number;
  startedAt: string | null;
}

export interface Roster {
  seed: number;
  rows: Row[];
  sort: SortColumn;
  dir: SortDirection;
  limit: number;
}

interface Page {
  page: number;
  ids: number[];
  keys: (string | number | null)[];
  total: number;
}

interface Trace {
  pages: Page[];
  /** The walk hit its budget with the total still promising more pages. */
  ranOut: boolean;
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

// Three departments and a short salary band, so ties are the normal case rather
// than something the generator has to be told to make.
const DEPARTMENTS = ['design', 'engineering', 'support'] as const;
const SALARIES = [68000, 79000, 79000, 104000, 104000, 121000, 141000] as const;
const STARTED = ['2018-07-30', '2020-01-20', '2021-12-06', '2023-04-11', '2024-02-17'] as const;
const COLUMNS = ['name', 'department', 'salary', 'startedAt'] as const;
// Chosen not to divide a roster: the four hand-written checkpoints only ever
// walk a page size that does, so a last page is always full.
const LIMITS = [1, 2, 3, 4, 5] as const;

function makeRows(next: () => number, count: number): Row[] {
  const rows: Row[] = [];
  for (let index = 0; index < count; index += 1) {
    rows.push({
      name: `emp${String(index).padStart(2, '0')}`,
      department: pick(next, DEPARTMENTS),
      salary: pick(next, SALARIES),
      // Nulls in the column nothing ever sorts on, which is the point of it.
      startedAt: next() < 0.28 ? null : pick(next, STARTED),
    });
  }
  return rows;
}

export function generateRosters(seed: number, count: number): Roster[] {
  const next = random(seed);
  const rosters: Roster[] = [];

  // Unbiased, a descending walk over a column carrying nulls takes 3 rosters to
  // reach on one of these seeds and 7 on the other, which is close enough that
  // the prefix is not buying much on these two. It is here because two seeds is
  // a small sample and a third could put it at forty: the configuration no
  // hand-written checkpoint enters should not be reached by luck.
  for (const dir of ['desc', 'asc'] as const) {
    rosters.push({
      seed,
      rows: makeRows(next, 5 + Math.floor(next() * 4)),
      sort: 'startedAt',
      dir,
      limit: pick(next, LIMITS),
    });
  }

  while (rosters.length < count) {
    rosters.push({
      seed,
      rows: makeRows(next, 4 + Math.floor(next() * 11)),
      sort: pick(next, COLUMNS),
      dir: next() < 0.5 ? 'asc' : 'desc',
      limit: pick(next, LIMITS),
    });
  }
  return rosters;
}

function keyOf(row: Row, sort: SortColumn): string | number | null {
  return row[sort];
}

function walk(roster: Roster, list: List): Trace {
  const db = createDb();
  db.delete(employees).run();
  const inserted = db.insert(employees).values(roster.rows).returning({ id: employees.id }).all();

  const byId = new Map<number, Row>();
  inserted.forEach((row, index) => {
    const source = roster.rows[index];
    if (source) byId.set(row.id, source);
  });

  const pages: Page[] = [];
  // The walk follows the total it was handed, because that is what a page
  // control does with it. The budget only stops a wrong one running away.
  let budget = Math.ceil(roster.rows.length / roster.limit) + 3;
  let ranOut = false;

  for (let page = 1; ; page += 1) {
    const result = list(db, { page, limit: roster.limit, sort: roster.sort, dir: roster.dir });
    pages.push({
      page,
      ids: result.items.map((item) => item.id),
      keys: result.items.map((item) => keyOf(item as Row, roster.sort)),
      total: result.total,
    });

    const claimed = Number.isFinite(result.total) ? Math.ceil(result.total / roster.limit) : 1;
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
 * The rules, each a sentence. One of them is a liveness rule and it is the half
 * nobody writes by hand: an employee who is in the table and on no page breaks
 * nothing a safety rule can see, and it is what a `WHERE` that quietly drops the
 * rows with no start date looks like from outside.
 */
function violation(roster: Roster, trace: Trace): string | null {
  const { sort, dir, limit } = roster;
  const seen = new Map<number, number[]>();

  for (const page of trace.pages) {
    if (page.ids.length > limit) {
      return `page ${page.page} came back with ${page.ids.length} employees for a limit of ${limit}. A page is never longer than the page size it was asked for.`;
    }

    const first = trace.pages[0];
    if (first && page.total !== first.total) {
      return `the same list reported a total of ${first.total} on page 1 and ${page.total} on page ${page.page}. The total is the size of the list, not of the page it came back with.`;
    }

    for (const id of page.ids) {
      const on = seen.get(id) ?? [];
      on.push(page.page);
      seen.set(id, on);
      if (on.length > 1) {
        const row = trace.byId.get(id);
        return `${row?.name ?? `employee ${id}`} came back on page ${on.join(' and page ')}. Walking every page hands back each employee once.`;
      }
    }
  }

  const total = trace.pages[0]?.total ?? 0;
  if (total !== roster.rows.length) {
    return `the list reported a total of ${total} over a table of ${roster.rows.length} employees. The total is the whole list, and it is what decides how many pages there are.`;
  }

  // Rows with no key are skipped rather than placed: either end is allowed.
  const ordered = trace.pages.flatMap((page) => page.keys).filter((key) => key !== null);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1] as string | number;
    const current = ordered[index] as string | number;
    const wrongWay = dir === 'desc' ? previous < current : previous > current;
    if (wrongWay) {
      return `sorting by ${sort} ${dir}, walking the pages put ${JSON.stringify(previous)} before ${JSON.stringify(current)}. Concatenating the pages has to give one ordering of the whole list, and that holds across a page boundary as well as inside one.`;
    }
  }

  for (const [id, row] of trace.byId) {
    if (seen.has(id)) continue;
    return `${row.name} is in the table and came back on no page at all. Walking every page of a ${sort} sort hands back every employee, and one that no page reaches is one nobody can see.`;
  }

  if (trace.ranOut) {
    return `the walk read ${trace.pages.length} pages of ${limit} over a table of ${roster.rows.length} employees and the total still said there was more to come. Paging through the list has to run out.`;
  }

  return null;
}

function check(roster: Roster, list: List): string | null {
  try {
    return violation(roster, walk(roster, list));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const SHRINK_BUDGET = 200;

/** Delta debugging over the rows, then the page size. Every accepted cut
 *  shortens the roster, so this terminates on its own; the budget is there to
 *  bound a slow submission. */
function shrink(roster: Roster, list: List): Roster {
  let best = roster;
  let spent = 0;

  for (let block = Math.max(1, best.rows.length >> 1); block >= 1; block >>= 1) {
    let from = 0;
    while (from + block <= best.rows.length && spent < SHRINK_BUDGET) {
      spent += 1;
      const rows = [...best.rows.slice(0, from), ...best.rows.slice(from + block)];
      const candidate = { ...best, rows };
      if (rows.length > 0 && check(candidate, list)) best = candidate;
      else from += 1;
    }
  }

  for (const limit of LIMITS) {
    if (spent >= SHRINK_BUDGET || limit >= best.limit) continue;
    spent += 1;
    const candidate = { ...best, limit };
    if (check(candidate, list)) best = candidate;
  }

  return best;
}

/**
 * Six non-blank lines reach the panel, so the rule goes first and the roster is
 * what gets cut. The rows are one line for the same reason.
 */
function report(roster: Roster, message: string): string {
  return [
    message,
    `sort ${roster.sort} ${roster.dir}, ${roster.limit} per page, ${roster.rows.length} employee(s), seed ${roster.seed}`,
    roster.rows
      .map(
        (row) => `${row.name}/${row.department}/${row.salary}/${row.startedAt ?? 'no start date'}`
      )
      .join(' · '),
  ].join('\n\n');
}

export function firstViolation(rosters: Roster[], list: List): string | null {
  for (const roster of rosters) {
    const message = check(roster, list);
    if (!message) continue;
    const smallest = shrink(roster, list);
    return report(smallest, check(smallest, list) ?? message);
  }
  return null;
}
