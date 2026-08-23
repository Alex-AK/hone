import { FakeBroker } from '../../src/lib/broker';
import { type Db, openDb, placeOrder } from '../../src/lib/db';
import { Relay, type RelayOutcome } from '../../src/lib/relay';

/**
 * Backlogs nobody wrote, for the fifth checkpoint.
 *
 * The other four run a batch size of ten in nine of their thirteen tests and
 * two in one of them, place every order before the first pass, and refuse only
 * the first or second row and only one at a time. The write that records a
 * publish is killed exactly once, on a backlog of one row, so it never dies in
 * the middle of a batch. `db.failNextWrite(fragment, skip)` exists for that and
 * documents itself as "how a checkpoint breaks the middle of a batch rather
 * than the start of one", and nothing in this workout passes the second
 * argument. These backlogs move all of it, and orders arrive between passes
 * rather than only before them.
 *
 * There is no second relay in here. The rules are read off a trace of what the
 * submission did, which is why a failure names the rule that broke rather than
 * a row that came out somewhere else.
 *
 * Everything is seeded. Nothing calls `Math.random`, so a failure reproduces on
 * the next run and on someone else's machine.
 */

type Op =
  | { kind: 'place'; totals: number[] }
  /** `killMark` is how many marks land before the write dies, or null for none. */
  | { kind: 'run'; killMark: number | null }
  | { kind: 'refuse'; id: number }
  | { kind: 'accept'; id: number };

export interface Backlog {
  seed: number;
  batchSize: number;
  opening: number[];
  ops: Op[];
}

/** One pass of the relay, as it went. */
interface Pass {
  index: number;
  outcome: RelayOutcome | 'threw';
  markArmed: boolean;
  arrivals: string[];
  markedBefore: number[];
  markedAfter: number[];
  /** At each publish: ids already sent this pass that nothing has recorded yet. */
  unrecorded: string[][];
  inTransaction: boolean[];
}

interface Trace {
  passes: Pass[];
  arrivals: string[];
  markedAtEnd: number[];
  /** Every row id that exists by the end, which is one per order placed. */
  existing: number[];
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

// Repeats are the weighting. A batch of one publishes and marks with nothing
// behind it, which is the shape every rule about ordering has nothing to say
// about, so the small sizes that do have something behind them are drawn most.
const BATCH = [1, 2, 2, 3, 3, 5, 10] as const;

function orders(next: () => number, count: number): number[] {
  return Array.from({ length: count }, () => 100 + Math.floor(next() * 900));
}

function makeBacklog(next: () => number, seed: number, forced?: Partial<Backlog>): Backlog {
  const batchSize = forced?.batchSize ?? pick(next, BATCH);
  const opening = forced?.opening ?? orders(next, 1 + Math.floor(next() * 4));
  const opCount = 3 + Math.floor(next() * 4);
  const ops: Op[] = [];
  const refused: number[] = [];
  let live = opening.length;

  for (let index = 0; index < opCount; index += 1) {
    const roll = next();
    if (roll < 0.55) {
      ops.push({ killMark: next() < 0.25 ? Math.floor(next() * 3) : null, kind: 'run' });
    } else if (roll < 0.72) {
      const totals = orders(next, 1 + Math.floor(next() * 2));
      live += totals.length;
      ops.push({ kind: 'place', totals });
    } else if (roll < 0.88 && live > 0) {
      const id = 1 + Math.floor(next() * live);
      refused.push(id);
      ops.push({ id, kind: 'refuse' });
    } else if (refused.length > 0) {
      ops.push({ id: refused.shift() as number, kind: 'accept' });
    } else {
      ops.push({ killMark: Math.floor(next() * 3), kind: 'run' });
    }
  }

  // Whatever else happened, the backlog ends with nothing refusing and enough
  // clean passes to drain it. A row still sitting there afterwards is stranded
  // rather than merely waiting its turn.
  for (const id of refused) ops.push({ id, kind: 'accept' });
  const drain = Math.ceil(live / batchSize) + 2;
  for (let index = 0; index < drain; index += 1) ops.push({ killMark: null, kind: 'run' });

  return { batchSize, opening, ops, seed, ...forced };
}

export function generateBacklogs(seed: number, count: number): Backlog[] {
  const next = random(seed);
  const backlogs: Backlog[] = [];

  // The mark dying in the middle of a batch is the case no hand-written
  // checkpoint reaches, and it is also the shortest backlog there is, so it is
  // forced rather than waited for.
  for (const skip of [1, 2] as const) {
    backlogs.push(
      makeBacklog(next, seed, {
        batchSize: 5,
        opening: [100, 200, 300, 400],
        ops: [
          { killMark: skip, kind: 'run' },
          { killMark: null, kind: 'run' },
          { killMark: null, kind: 'run' },
        ],
      })
    );
  }

  while (backlogs.length < count) backlogs.push(makeBacklog(next, seed));
  return backlogs;
}

function marked(db: Db): number[] {
  return db
    .prepare('SELECT id FROM outbox WHERE published_at IS NOT NULL ORDER BY id')
    .all<{ id: number }>()
    .map((row) => row.id);
}

async function runBacklog(backlog: Backlog): Promise<Trace> {
  const db = openDb();
  const broker = new FakeBroker();
  for (const total of backlog.opening) placeOrder(db, total);

  const relay = new Relay(db, broker, { batchSize: backlog.batchSize });
  const trace: Trace = { arrivals: [], existing: [], markedAtEnd: [], passes: [] };
  let live = backlog.opening.length;
  let passIndex = 0;

  for (const op of backlog.ops) {
    if (op.kind === 'place') {
      for (const total of op.totals) placeOrder(db, total);
      live += op.totals.length;
      continue;
    }
    if (op.kind === 'refuse') {
      broker.refuseEvery(String(op.id));
      continue;
    }
    if (op.kind === 'accept') {
      broker.accept(String(op.id));
      continue;
    }

    const before = broker.publishedIds().length;
    const pass: Pass = {
      arrivals: [],
      inTransaction: [],
      index: (passIndex += 1),
      markArmed: op.killMark !== null,
      markedAfter: [],
      markedBefore: marked(db),
      outcome: 'threw',
      unrecorded: [],
    };

    broker.observeEachPublish(() => {
      pass.inTransaction.push(db.inTransaction);
      const sentThisPass = broker.publishedIds().slice(before);
      const stillNull = new Set(
        db
          .prepare('SELECT id FROM outbox WHERE published_at IS NULL')
          .all<{ id: number }>()
          .map((row) => String(row.id))
      );
      pass.unrecorded.push(sentThisPass.filter((id) => stillNull.has(id)));
    });

    if (op.killMark !== null) db.failNextWrite('UPDATE outbox', op.killMark);

    pass.outcome = await relay.runOnce().then(
      (outcome) => outcome,
      () => 'threw' as const
    );
    pass.arrivals = broker.publishedIds().slice(before);
    pass.markedAfter = marked(db);
    trace.passes.push(pass);

    // An arm the pass never reached would otherwise fire inside the next one,
    // and re-arming on a fragment no statement contains is how it is put down.
    if (op.killMark !== null) db.failNextWrite('no statement contains this');
  }

  trace.arrivals = broker.publishedIds();
  trace.markedAtEnd = marked(db);
  trace.existing = Array.from({ length: live }, (_, index) => index + 1);
  return trace;
}

/**
 * The rules, each a sentence. Two of them are liveness rules and they are the
 * half nobody writes by hand: a row that reaches no broker and a batch that
 * publishes further than it has recorded both leave everything a safety rule
 * looks at exactly as it should be.
 */
function violation(backlog: Backlog, trace: Trace): string | null {
  for (const pass of trace.passes) {
    const where = `pass ${pass.index}`;

    if (pass.inTransaction.some(Boolean)) {
      return `${where} was holding a transaction open with a publish in flight. A transaction is held until it commits whatever the connection is waiting on, so every other writer queues behind a network call.`;
    }

    if (pass.outcome === 'threw' && !pass.markArmed) {
      return `${where} threw. A broker that refuses a message is Tuesday, and a pass reports what it managed rather than propagating.`;
    }

    if (pass.arrivals.length > backlog.batchSize) {
      return `${where} sent ${pass.arrivals.length} rows and batchSize is ${backlog.batchSize}. A pass is a bounded amount of work, which is what stops one relay run becoming the outage.`;
    }

    const landed = pass.markedAfter.filter((id) => !pass.markedBefore.includes(id));
    if (pass.outcome !== 'threw' && pass.outcome.published !== landed.length) {
      return `${where} reported ${pass.outcome.published} published and ${landed.length} row(s) actually got their mark. published counts rows the broker took and the outbox now records, so one nobody recorded is not among them.`;
    }

    for (const id of landed) {
      if (trace.arrivals.includes(String(id))) continue;
      return `${where} marked row ${id} published and the broker never took it. That row is an order fulfilment will never hear about, and the outbox says it was sent.`;
    }

    const unrecorded = pass.unrecorded.find((ids) => ids.length > 0);
    if (unrecorded && !pass.markArmed) {
      return `${where} started publishing a row while ${unrecorded.join(', ')} were already at the broker with nothing recording them. A relay that dies here resends every one of them, where the design only ever owes you one duplicate.`;
    }
  }

  for (let index = 1; index < trace.arrivals.length; index += 1) {
    const previous = Number(trace.arrivals[index - 1]);
    const current = Number(trace.arrivals[index]);
    if (current < previous) {
      return `the broker got row ${current} after row ${previous}. Rows reach the broker in id order, so a consumer told about order ${current} once ${previous} has already been through has been told in the wrong order.`;
    }
  }

  const stranded = trace.existing.filter((id) => !trace.markedAtEnd.includes(id));
  if (stranded.length > 0) {
    return `row ${stranded.join(', ')} were never published, with nothing refusing them and passes left over. Every row in the outbox is an order somebody paid for.`;
  }

  const gap = trace.markedAtEnd.find((id, index) => id !== index + 1);
  if (gap !== undefined) {
    return `row ${gap} is marked published and something before it is not. The outbox drains from the front: a pass stops at the row it could not send rather than stepping over it.`;
  }

  return null;
}

async function check(backlog: Backlog): Promise<string | null> {
  try {
    return violation(backlog, await runBacklog(backlog));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const SHRINK_BUDGET = 150;

/** Delta debugging over the ops, then the opening orders. Every accepted cut
 *  shortens the backlog, so this terminates on its own; the budget is there to
 *  bound a slow submission. */
async function shrink(backlog: Backlog): Promise<Backlog> {
  let best = backlog;
  let spent = 0;

  for (let block = Math.max(1, best.ops.length >> 1); block >= 1; block >>= 1) {
    let from = 0;
    while (from + block <= best.ops.length && spent < SHRINK_BUDGET) {
      spent += 1;
      const ops = [...best.ops.slice(0, from), ...best.ops.slice(from + block)];
      const candidate = { ...best, ops };
      if (ops.length > 0 && (await check(candidate))) best = candidate;
      else from += 1;
    }
  }

  while (best.opening.length > 1 && spent < SHRINK_BUDGET) {
    spent += 1;
    const candidate = { ...best, opening: best.opening.slice(0, -1) };
    if (await check(candidate)) best = candidate;
    else break;
  }

  return best;
}

function describeOp(op: Op): string {
  if (op.kind === 'place') return `place ${op.totals.length}`;
  if (op.kind === 'refuse') return `refuse ${op.id}`;
  if (op.kind === 'accept') return `accept ${op.id}`;
  return op.killMark === null ? 'run' : `run (the mark dies after ${op.killMark})`;
}

/**
 * Six non-blank lines reach the panel, so the rule goes first and the backlog is
 * what gets cut. The ops are one line for the same reason.
 */
function report(backlog: Backlog, message: string): string {
  return [
    message,
    `batchSize ${backlog.batchSize}, ${backlog.opening.length} order(s) to start, seed ${backlog.seed}`,
    backlog.ops.map(describeOp).join(' → '),
  ].join('\n\n');
}

export async function firstViolation(backlogs: Backlog[]): Promise<string | null> {
  for (const backlog of backlogs) {
    const message = await check(backlog);
    if (!message) continue;
    const smallest = await shrink(backlog);
    return report(smallest, (await check(smallest)) ?? message);
  }
  return null;
}
