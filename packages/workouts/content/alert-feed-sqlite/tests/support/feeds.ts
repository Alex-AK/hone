/**
 * The other four checkpoints walk one feed: the 630 alerts `createDb` seeds,
 * twenty to a page. This one generates the feed, the page size and the changes
 * made while it is walked, then reads the rules off the walk. There is no
 * second feed in it anywhere: every check looks at which ids came back and on
 * which page, which is what the brief says the checkpoints judge.
 *
 * A fixed page size is what makes the other four blind in one direction. Where
 * the page boundary lands never moves, so a cursor can be wrong about ties, or
 * about alerts whose id and timestamp disagree, and still come back right on
 * that one dataset at that one size.
 *
 * Everything is seeded. Nothing calls `Math.random`, so a failure reproduces on
 * the next run and on someone else's machine.
 */

import { acknowledgeAlert, createDb, type Db, firingAlertIds } from '../../src/server/db';
import { listAlerts } from '../../src/server/feed';
import type { FeedAlert } from '../../src/server/types';
import { repeats } from './walk';

type Status = 'acknowledged' | 'firing';

interface Row {
  id: number;
  service: string;
  message: string;
  status: Status;
  createdAt: string;
}

/** Something on-call does to the feed while somebody is reading it. */
type Change =
  | { kind: 'acknowledge'; target: 'above-the-page' | 'first-on-the-page' | 'last-on-the-page' }
  | {
      kind: 'fire';
      id: number;
      /** Separates two alerts fired at the same end of the feed. */
      step: number;
      where: 'just-under-the-last-row' | 'newest' | 'oldest' | 'tied-with-the-last-row';
    };

interface ScheduledChange {
  /** The index of the page after which this happens. */
  after: number;
  change: Change;
}

export interface Scenario {
  rows: Row[];
  limit: number;
  changes: ScheduledChange[];
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
  return items[Math.floor(next() * items.length)];
}

const BASE = Date.UTC(2026, 2, 2, 8, 0, 0);
const MINUTE = 60_000;

function at(step: number): string {
  return new Date(BASE + step * MINUTE).toISOString();
}

const SERVICES = ['checkout-api', 'billing-worker', 'auth-api', 'cdn-edge'];
const MESSAGES = [
  '5xx rate above 1%',
  'p99 latency over 2s',
  'queue depth over 10k',
  'no data for 5 minutes',
];

/** How many alerts share one `created_at`, which is where a tie cluster comes from. */
const CLUSTER_SIZES = [1, 1, 2, 3, 5];
const FIRING_CHANCES = [0.5, 0.75, 1];
const LIMITS = [1, 2, 2, 3, 4, 5, 7];
const ACKNOWLEDGE_TARGETS = ['first-on-the-page', 'last-on-the-page', 'above-the-page'] as const;
const FIRE_PLACES = [
  'newest',
  'tied-with-the-last-row',
  'just-under-the-last-row',
  'oldest',
] as const;

function shuffle(items: number[], next: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function generateRows(next: () => number): Row[] {
  const count = 10 + Math.floor(next() * 26);
  const cluster = pick(next, CLUSTER_SIZES);
  const firingChance = pick(next, FIRING_CHANCES);
  // Most feeds number their alerts in an order that has nothing to do with when
  // they fired. Nothing in the schema says the two agree, and a cursor that
  // compares the columns separately rather than as a pair only comes apart
  // where they disagree.
  const ids = Array.from({ length: count }, (_, i) => 100 + i);
  if (next() < 0.7) shuffle(ids, next);

  const rows: Row[] = [];
  let step = 0;

  for (let i = 0; i < count; i += 1) {
    if (i > 0 && i % cluster === 0) step += 1 + Math.floor(next() * 3);
    rows.push({
      id: ids[i],
      service: SERVICES[i % SERVICES.length],
      message: MESSAGES[i % MESSAGES.length],
      status: next() < firingChance ? 'firing' : 'acknowledged',
      createdAt: at(step),
    });
  }

  return rows;
}

function generateChanges(next: () => number): ScheduledChange[] {
  const count = Math.floor(next() * 4);

  return Array.from({ length: count }, (_, i): ScheduledChange => {
    const after = Math.floor(next() * 6);
    if (next() < 0.5) {
      return { after, change: { kind: 'acknowledge', target: pick(next, ACKNOWLEDGE_TARGETS) } };
    }
    // Half of the new alerts get an id below everything already there and half
    // an id above it, so a new alert sharing a timestamp with the row a page
    // stopped on lands on either side of it.
    const id = next() < 0.5 ? 1 + i : 5000 + i;
    return { after, change: { kind: 'fire', id, step: i, where: pick(next, FIRE_PLACES) } };
  });
}

export function generateScenarios(seed: number, count: number): Scenario[] {
  const next = random(seed);

  return Array.from({ length: count }, () => ({
    rows: generateRows(next),
    limit: pick(next, LIMITS),
    changes: generateChanges(next),
  }));
}

let shared: Db | null = null;

/**
 * One connection for every scenario. `createDb` seeds 630 alerts and every
 * scenario replaces them, so a fresh database per scenario would spend most of
 * this checkpoint's runtime writing rows it is about to delete.
 */
function feedDb(): Db {
  shared ??= createDb();
  return shared;
}

function buildFeed(db: Db, rows: readonly Row[]): void {
  db.exec('DELETE FROM alerts');
  const insert = db.prepare(
    'INSERT INTO alerts (id, service, message, status, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  db.transaction(() => {
    for (const row of rows) {
      insert.run(row.id, row.service, row.message, row.status, row.createdAt);
    }
  })();
}

function fireAlert(db: Db, id: number, createdAt: string): void {
  db.prepare(
    `INSERT INTO alerts (id, service, message, status, created_at)
     VALUES (?, 'checkout-api', 'error rate above 5%', 'firing', ?)`
  ).run(id, createdAt);
}

/** The firing alert immediately above the top of the page just read. */
function justAbove(db: Db, top: FeedAlert): number | null {
  const row = db
    .prepare(
      `SELECT id FROM alerts
        WHERE status = 'firing' AND (created_at, id) > (?, ?)
        ORDER BY created_at ASC, id ASC
        LIMIT 1`
    )
    .get<{ id: number }>(top.createdAt, top.id);
  return row?.id ?? null;
}

interface Applied {
  after: number;
  description: string;
  /** The alert this took out of the feed, where it took one out. */
  acknowledged: number | null;
}

const WHERE_IT_WAS: Record<(typeof ACKNOWLEDGE_TARGETS)[number], string> = {
  'first-on-the-page': 'the first alert on it',
  'last-on-the-page': 'the last alert on it',
  'above-the-page': 'the alert just above it',
};

function apply(db: Db, entry: ScheduledChange, page: readonly FeedAlert[]): Applied | null {
  const { after, change } = entry;
  const top = page[0];
  const bottom = page[page.length - 1];

  if (change.kind === 'acknowledge') {
    const target =
      change.target === 'first-on-the-page'
        ? (top?.id ?? null)
        : change.target === 'last-on-the-page'
          ? (bottom?.id ?? null)
          : top
            ? justAbove(db, top)
            : null;

    if (target === null) return null;
    acknowledgeAlert(db, target);
    return {
      after,
      description: `alert ${target} was acknowledged, ${WHERE_IT_WAS[change.target]}`,
      acknowledged: target,
    };
  }

  const createdAt = firedAt(change, bottom);
  if (createdAt === null) return null;
  fireAlert(db, change.id, createdAt);
  return { after, description: `alert ${change.id} fired at ${createdAt}`, acknowledged: null };
}

function firedAt(change: Extract<Change, { kind: 'fire' }>, bottom: FeedAlert | undefined): string {
  if (change.where === 'newest') return at(1000 + change.step);
  if (change.where === 'oldest') return at(-1000 - change.step);
  if (!bottom) return at(1000 + change.step);
  if (change.where === 'tied-with-the-last-row') return bottom.createdAt;
  // Every generated alert lands on a whole minute, so half a minute under the
  // row the page stopped on is under it and above whatever comes next.
  const under = Date.parse(bottom.createdAt) - 30_000;
  return Number.isNaN(under) ? at(1000 + change.step) : new Date(under).toISOString();
}

interface Page {
  items: FeedAlert[];
  nextCursor: string | null;
}

interface Trace {
  pages: Page[];
  applied: Applied[];
  firingAtStart: number;
  /** Firing when the walk started, and acknowledged by nobody while it ran. */
  mustAppear: number[];
  overran: boolean;
}

function runScenario(scenario: Scenario): Trace {
  const db = feedDb();
  buildFeed(db, scenario.rows);

  const firing = firingAlertIds(db);
  const takenOut = new Set<number>();
  const pages: Page[] = [];
  const applied: Applied[] = [];
  let cursor: string | null = null;
  let overran = true;

  // A page size of one needs a page per firing alert and nothing needs more, so
  // anything past this is a walk that does not end.
  const budget = firing.length + scenario.changes.length + 4;

  for (let index = 0; index < budget; index += 1) {
    const page = listAlerts(db, { status: 'firing', limit: scenario.limit, cursor });
    const items = [...page.items];
    pages.push({ items, nextCursor: page.nextCursor });

    for (const entry of scenario.changes) {
      if (entry.after !== index) continue;
      const done = apply(db, entry, items);
      if (!done) continue;
      applied.push(done);
      if (done.acknowledged !== null) takenOut.add(done.acknowledged);
    }

    cursor = page.nextCursor;
    if (!cursor) {
      overran = false;
      break;
    }
  }

  return {
    pages,
    applied,
    firingAtStart: firing.length,
    mustAppear: firing.filter((id) => !takenOut.has(id)),
    overran,
  };
}

/**
 * Every rule here is a sentence from the brief, read off the walk rather than
 * compared against a second feed. Both halves are covered on purpose. Handing
 * an alert over twice is what a safety rule catches, and it is the half that is
 * easy to think of; an alert that is on no page at all breaks nothing anybody
 * can see from one page, and only the coverage rule at the bottom catches it.
 */
function violation(scenario: Scenario, trace: Trace): string | null {
  const { limit } = scenario;

  for (const [index, page] of trace.pages.entries()) {
    const where = `page ${index + 1}`;

    const notFiring = page.items.find((alert) => alert.status !== 'firing');
    if (notFiring) {
      return `${where} handed over alert ${notFiring.id}, which was ${notFiring.status} by then. The feed is the alerts still firing.`;
    }

    if (page.items.length > limit) {
      return `${where} came back with ${page.items.length} alerts and the page size was ${limit}.`;
    }

    for (let i = 1; i < page.items.length; i += 1) {
      const above = page.items[i - 1];
      const below = page.items[i];
      if (below.createdAt > above.createdAt) {
        return `${where} put alert ${below.id} (${below.createdAt}) under alert ${above.id} (${above.createdAt}), and the one underneath is the newer. The feed is newest first.`;
      }
    }

    if (page.items.length < limit && page.nextCursor) {
      return `${where} came back with ${page.items.length} of the ${limit} it was asked for and handed back a cursor anyway. A page that short means the feed ran out, and nextCursor is null once there is nothing after the page.`;
    }
  }

  if (trace.overran) {
    return `the walk read ${trace.pages.length} pages of ${limit} off a feed of ${trace.firingAtStart} firing alerts and still had a cursor. It never ends.`;
  }

  const seen = trace.pages.flatMap((page) => page.items.map((alert) => alert.id));
  const [twice] = repeats(seen);
  if (twice !== undefined) {
    const on = trace.pages
      .map((page, index) => (page.items.some((alert) => alert.id === twice) ? index + 1 : 0))
      .filter((index) => index > 0);
    return `alert ${twice} came back on page ${on.join(' and page ')}. That is two people picking up the same alert.`;
  }

  const missed = trace.mustAppear.filter((id) => !seen.includes(id));
  const [first] = missed;
  if (first !== undefined) {
    const rest = missed.length > 1 ? ` It is one of ${missed.length}: ${missed.join(', ')}.` : '';
    return `alert ${first} was firing when the walk started and nobody acknowledged it, and it was on no page at all.${rest}`;
  }

  return null;
}

function check(scenario: Scenario): string | null {
  try {
    return violation(scenario, runScenario(scenario));
  } catch (error) {
    return `the walk threw: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Delta debugging: drop the largest block of rows that keeps the rule broken,
 * then halve the block and go again, then do the same to the changes and try a
 * smaller page. Every accepted cut shortens the feed, so this terminates on its
 * own; the budget is there to bound a submission that walks slowly.
 */
const SHRINK_BUDGET = 400;

function shrink(scenario: Scenario): Scenario {
  let best = scenario;
  let budget = SHRINK_BUDGET;

  const fails = (candidate: Scenario): boolean => {
    if (budget <= 0) return false;
    budget -= 1;
    return check(candidate) !== null;
  };

  for (let round = 0; round < 2; round += 1) {
    best = dropRows(best, fails);
    best = dropChanges(best, fails);
    best = smallerPages(best, fails);
  }

  return best;
}

function dropRows(start: Scenario, fails: (candidate: Scenario) => boolean): Scenario {
  let best = start;

  for (let block = Math.max(1, best.rows.length >> 1); block >= 1; block >>= 1) {
    let from = 0;
    while (from + block <= best.rows.length) {
      const rows = [...best.rows.slice(0, from), ...best.rows.slice(from + block)];
      if (rows.length > 0 && fails({ ...best, rows })) best = { ...best, rows };
      else from += 1;
    }
  }

  return best;
}

function dropChanges(start: Scenario, fails: (candidate: Scenario) => boolean): Scenario {
  let best = start;

  for (let block = Math.max(1, best.changes.length >> 1); block >= 1; block >>= 1) {
    let from = 0;
    while (from + block <= best.changes.length) {
      const changes = [...best.changes.slice(0, from), ...best.changes.slice(from + block)];
      if (fails({ ...best, changes })) best = { ...best, changes };
      else from += 1;
    }
  }

  return best;
}

function smallerPages(start: Scenario, fails: (candidate: Scenario) => boolean): Scenario {
  for (let limit = 1; limit < start.limit; limit += 1) {
    if (fails({ ...start, limit })) return { ...start, limit };
  }
  return start;
}

function feedTable(rows: readonly Row[]): string[] {
  const ordered = [...rows].sort((a, b) =>
    a.createdAt === b.createdAt ? b.id - a.id : a.createdAt < b.createdAt ? 1 : -1
  );
  const width = Math.max(...ordered.map((row) => String(row.id).length));
  return ordered.map(
    (row) => `    ${String(row.id).padStart(width)}  ${row.createdAt}  ${row.status}`
  );
}

const PAGES_PRINTED = 12;

function pagesHandedOver(trace: Trace): string[] {
  const lines = trace.pages
    .slice(0, PAGES_PRINTED)
    .map((page, index) =>
      page.items.length === 0
        ? `    page ${index + 1}: nothing`
        : `    page ${index + 1}: ${page.items.map((alert) => alert.id).join(', ')}`
    );
  const hidden = trace.pages.length - PAGES_PRINTED;
  return hidden > 0 ? [...lines, `    and ${hidden} more`] : lines;
}

/**
 * The report is the point of the checkpoint: the shrunk feed, what happened to
 * it mid-walk, what came back on each page, and the rule that broke.
 */
function report(scenario: Scenario): string {
  let trace: Trace | null = null;
  let message: string;

  try {
    trace = runScenario(scenario);
    message = violation(scenario, trace) ?? 'no rule broke the second time around';
  } catch (error) {
    message = `the walk threw: ${error instanceof Error ? error.message : String(error)}`;
  }

  const lines = [
    'The feed broke one of its own rules on this walk:',
    '',
    `  page size ${scenario.limit}`,
    '',
    '  the feed when the walk started, newest first',
    ...feedTable(scenario.rows),
  ];

  if (trace && trace.applied.length > 0) {
    lines.push('', '  and while it was being walked');
    for (const done of trace.applied) {
      lines.push(`    after page ${done.after + 1}: ${done.description}`);
    }
  }

  if (trace) {
    lines.push('', '  what came back', ...pagesHandedOver(trace));
  }

  lines.push('', `  ${message}`);
  return lines.join('\n');
}

/**
 * Walks the scenarios and returns a report for the first one that breaks a
 * rule, or null when every one of them held.
 */
export function firstViolation(scenarios: readonly Scenario[]): string | null {
  for (const scenario of scenarios) {
    if (check(scenario)) return report(shrink(scenario));
  }
  return null;
}
