import { Clock } from '../../src/lib/clock';
import { Consumer, type RunOutcome } from '../../src/lib/consumer';
import { FakeQueue, type QueueMessage } from '../../src/lib/queue';

/**
 * Backlogs nobody wrote, for the fifth checkpoint.
 *
 * The other four hold two things still. Every one of them runs on the same
 * `{ visibilityTimeoutMs: 30_000, heartbeatMs: 10_000, maxReceiveCount: 3 }`,
 * and the one delivery whose ack dies is the first delivery of a job with two
 * more to come, which is the spot where getting the ack's neighbourhood wrong
 * has somewhere to disappear to. They also only ever read the queue between
 * runs, so nothing asks whether a job is still hidden while its handler is
 * actually running. This varies all of it: the three options, which delivery
 * carries which work, which ack dies, and what the queue is holding at every
 * step a slow handler wakes on.
 *
 * There is no second consumer in here and no model of one. The rules below are
 * read off a trace of what the submission did, which is why a failure names the
 * rule that broke rather than a number that came out different.
 *
 * Everything is seeded. Nothing calls `Math.random`, so a failure reproduces on
 * the next run and on someone else's machine.
 */

interface Doc {
  documentId: string;
}

interface Options {
  visibilityTimeoutMs: number;
  heartbeatMs: number;
  maxReceiveCount: number;
}

/** What the handler does on the delivery this op drives. */
type Work =
  | { kind: 'ok' }
  | { kind: 'throw' }
  | { kind: 'slow'; steps: number; stepMs: number; then: 'ok' | 'throw' };

type Op = { kind: 'run'; work: Work; ackDies: boolean } | { kind: 'advance'; ms: number };

export interface Backlog {
  seed: number;
  options: Options;
  documents: number;
  ops: Op[];
}

/** One delivery, as it actually went. */
interface Delivery {
  at: number;
  endedAt: number;
  documentId: string;
  receiveCount: number;
  /** The handler returned rather than threw. The conversion happened. */
  finished: boolean;
  outcome: RunOutcome | 'threw' | 'stuck';
  /** Clock readings at which the queue was no longer hiding this job. */
  exposedAt: number[];
  depthBefore: number;
  depthAfter: number;
  deadBefore: number;
  deadAfter: number;
  visibleBefore: number;
  handlerRan: boolean;
}

/** A job the queue was still hiding when it should have handed it back. */
interface Stuck {
  at: number;
  documentId: string;
  endedAt: number;
}

interface Trace {
  deliveries: Delivery[];
  stuck: Stuck[];
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

// Repeats are the weighting. A one-delivery job reaches its limit on the first
// ack that dies, which is the shortest form of the case the other four never
// reach, so the low limits are drawn most often.
const LIMITS = [1, 1, 2, 2, 3, 3, 4] as const;
const VISIBILITY = [10_000, 20_000, 30_000, 30_000, 45_000] as const;
// A heartbeat at or past the visibility timeout cannot be held: the queue hands
// the job out before the first beat is due, and no submission can prevent that.
// These are fractions of the timeout, and the coarsest is the interesting one.
const HEARTBEAT_SHARE = [0.25, 0.334, 0.5, 0.5, 0.75] as const;
const WORK_STEPS = [1, 2, 2, 3] as const;
// Off the boundary rather than out of a range: a handler that wakes exactly when
// the heartbeat is due is what catches a beat with no margin in it.
const STEP_SHARE = [0.5, 1, 1, 1.5, 2] as const;

function makeOptions(next: () => number): Options {
  const visibilityTimeoutMs = pick(next, VISIBILITY);
  const heartbeatMs = Math.max(1, Math.round(visibilityTimeoutMs * pick(next, HEARTBEAT_SHARE)));
  return { visibilityTimeoutMs, heartbeatMs, maxReceiveCount: pick(next, LIMITS) };
}

function makeWork(next: () => number, options: Options): Work {
  const roll = next();
  if (roll < 0.35) {
    const steps = pick(next, WORK_STEPS);
    const stepMs = Math.max(1, Math.round(options.heartbeatMs * pick(next, STEP_SHARE)));
    return { kind: 'slow', steps, stepMs, then: next() < 0.5 ? 'ok' : 'throw' };
  }
  return roll < 0.68 ? { kind: 'throw' } : { kind: 'ok' };
}

function makeBacklog(next: () => number, seed: number, forced?: Partial<Backlog>): Backlog {
  const options = forced?.options ?? makeOptions(next);
  const documents = forced?.documents ?? pick(next, [1, 1, 1, 2, 3]);
  const opCount = 3 + Math.floor(next() * 4);
  const ops: Op[] = [];
  for (let index = 0; index < opCount; index += 1) {
    if (next() < 0.3) {
      // The movements worth making land either side of a deadline.
      const spans = [
        1,
        options.heartbeatMs,
        options.visibilityTimeoutMs - 1,
        options.visibilityTimeoutMs,
        options.visibilityTimeoutMs + 1,
      ];
      ops.push({ kind: 'advance', ms: pick(next, spans) });
      continue;
    }
    const work = makeWork(next, options);
    // An ack only dies where one is attempted. A delivery whose handler throws
    // never acks, so arming it there would leave the charge sitting for
    // whichever delivery acked next.
    const settles = work.kind === 'throw' || (work.kind === 'slow' && work.then === 'throw');
    ops.push({ kind: 'run', work, ackDies: !settles && next() < 0.3 });
  }
  return { seed, options, documents, ops, ...forced };
}

export function generateBacklogs(seed: number, count: number): Backlog[] {
  const next = random(seed);
  const backlogs: Backlog[] = [];

  // Unbiased, a job whose ack dies on the last delivery it had takes 6 backlogs
  // to surface on one of these seeds and 26 on the other. Forced, it is the
  // first one, because the shortest form of it is a single run.
  for (const maxReceiveCount of [1, 1, 2] as const) {
    const visibilityTimeoutMs = pick(next, VISIBILITY);
    backlogs.push(
      makeBacklog(next, seed, {
        options: {
          visibilityTimeoutMs,
          heartbeatMs: Math.max(1, Math.round(visibilityTimeoutMs * pick(next, HEARTBEAT_SHARE))),
          maxReceiveCount,
        },
        documents: 1,
        ops: [
          { kind: 'run', work: { kind: 'ok' }, ackDies: true },
          { kind: 'advance', ms: visibilityTimeoutMs },
          { kind: 'run', work: { kind: 'ok' }, ackDies: false },
        ],
      })
    );
  }

  while (backlogs.length < count) backlogs.push(makeBacklog(next, seed));
  return backlogs;
}

const PENDING = Symbol('pending');

/**
 * Whether a run has settled, without paying for a macrotask to find out. A run
 * whose handler needs no clock settles in microtasks, and most of them are that
 * shape; only a slow one is worth advancing for.
 */
async function poll<T>(run: Promise<T>): Promise<T | typeof PENDING> {
  const ticks = (async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    return PENDING;
  })();
  return Promise.race([run, ticks]);
}

async function runBacklog(backlog: Backlog): Promise<Trace> {
  const clock = new Clock();
  const queue = new FakeQueue<Doc>(
    { visibilityTimeoutMs: backlog.options.visibilityTimeoutMs },
    clock
  );
  for (let index = 0; index < backlog.documents; index += 1)
    queue.send({ documentId: `doc-${index + 1}` });

  const trace: Trace = { deliveries: [], stuck: [] };
  let current: { work: Work; delivery: Delivery } | null = null;

  const handler = async (_body: Doc, message: QueueMessage<Doc>): Promise<void> => {
    const active = current;
    if (!active) return;
    active.delivery.handlerRan = true;
    active.delivery.documentId = message.id;
    active.delivery.receiveCount = message.receiveCount;

    const work = active.work;
    if (work.kind === 'slow') {
      for (let step = 0; step < work.steps; step += 1) {
        await clock.sleep(work.stepMs);
        if (!queue.inFlight().some((entry) => entry.id === message.id)) {
          active.delivery.exposedAt.push(clock.now());
        }
      }
      if (work.then === 'throw') throw new Error('that file is not a document');
    } else if (work.kind === 'throw') {
      throw new Error('that file is not a document');
    }
    active.delivery.finished = true;
  };

  const consumer = new Consumer<Doc>(queue, handler, backlog.options, clock);

  /**
   * Everything the queue was hiding that it should have handed back by now. The
   * deadline is unknowable from outside, but it is at most one visibility
   * timeout past the moment the handler let go, so this only ever accuses a
   * submission that is holding a job open with nothing running.
   */
  const observeStuck = (): void => {
    const now = clock.now();
    const hidden = new Set(queue.inFlight().map((entry) => entry.id));
    // Only the newest delivery of a job says anything about where its deadline
    // is. A redelivery moves it, so an older one is answered rather than late.
    const newest = new Map<string, Delivery>();
    for (const delivery of trace.deliveries) {
      if (delivery.documentId) newest.set(delivery.documentId, delivery);
    }
    for (const delivery of newest.values()) {
      if (!hidden.has(delivery.documentId)) continue;
      if (delivery.outcome === 'handled' || delivery.outcome === 'dead-lettered') continue;
      if (now >= delivery.endedAt + backlog.options.visibilityTimeoutMs) {
        trace.stuck.push({ at: now, documentId: delivery.documentId, endedAt: delivery.endedAt });
      }
    }
  };

  for (const op of backlog.ops) {
    if (op.kind === 'advance') {
      await clock.advance(op.ms);
      observeStuck();
      continue;
    }

    const depthBefore = queue.depth();
    const delivery: Delivery = {
      at: clock.now(),
      endedAt: clock.now(),
      documentId: '',
      receiveCount: 0,
      finished: false,
      outcome: 'idle',
      exposedAt: [],
      depthBefore,
      depthAfter: depthBefore,
      deadBefore: queue.deadLetters().length,
      deadAfter: queue.deadLetters().length,
      visibleBefore: depthBefore - queue.inFlight().length,
      handlerRan: false,
    };
    current = { work: op.work, delivery };
    if (op.ackDies) queue.failNextAck();

    const run = consumer.runOnce().then(
      (outcome) => outcome,
      () => 'threw' as const
    );

    let settled = await poll(run);
    if (settled === PENDING) {
      const stepMs = op.work.kind === 'slow' ? op.work.stepMs : 1;
      const budget = op.work.kind === 'slow' ? op.work.steps + 2 : 2;
      for (let step = 0; step < budget && settled === PENDING; step += 1) {
        await clock.advance(stepMs);
        settled = await poll(run);
      }
    }

    delivery.outcome = settled === PENDING ? 'stuck' : settled;
    delivery.endedAt = clock.now();
    delivery.depthAfter = queue.depth();
    delivery.deadAfter = queue.deadLetters().length;
    current = null;
    trace.deliveries.push(delivery);
    observeStuck();
  }

  return trace;
}

/**
 * The rules, each a sentence. Two of them are liveness rules and they are the
 * half nobody writes by hand: a worker that quietly holds a job open, or one
 * that never finishes a run, breaks nothing a safety rule can see.
 */
function violation(backlog: Backlog, trace: Trace): string | null {
  for (const delivery of trace.deliveries) {
    const where = `delivery ${delivery.receiveCount} of ${delivery.documentId || 'nothing'}`;

    if (delivery.outcome === 'stuck') {
      return `a run never finished, with the clock moved as far as ${where} could possibly need. A handler that is waiting on something nobody is going to send is a worker that has stopped.`;
    }

    if (delivery.outcome === 'handled' && delivery.depthAfter !== delivery.depthBefore - 1) {
      return `${where} answered handled while the job was still on the queue. handled is the claim that the work is done and the queue knows it, so it cannot be said until the ack has actually landed.`;
    }

    if (
      delivery.handlerRan &&
      !delivery.finished &&
      delivery.deadAfter === delivery.deadBefore &&
      delivery.depthAfter !== delivery.depthBefore
    ) {
      return `${where} did not convert the document, and the job left the queue anyway. Until the handler has returned, the only thing keeping that document is the queue still holding it.`;
    }

    if (delivery.finished && delivery.deadAfter > delivery.deadBefore) {
      return `${where} converted the document and then sent it to the dead-letter store. Whatever went wrong after the handler returned, the conversion happened, and a job in the dead-letter store is one a person has to look at.`;
    }

    if (
      delivery.deadAfter > delivery.deadBefore &&
      delivery.receiveCount !== backlog.options.maxReceiveCount
    ) {
      return `${where} was dead-lettered on its ${delivery.receiveCount}th delivery, and maxReceiveCount is ${backlog.options.maxReceiveCount}. A job gets every delivery it was promised before it stops being this queue's problem.`;
    }

    if (
      delivery.handlerRan &&
      !delivery.finished &&
      delivery.receiveCount >= backlog.options.maxReceiveCount &&
      delivery.deadAfter === delivery.deadBefore
    ) {
      return `${where} failed on the last delivery it was promised, and the job is still circulating. maxReceiveCount is ${backlog.options.maxReceiveCount}, and nothing in the queue dead-letters on its own, so a job nobody stops goes round forever.`;
    }

    if (delivery.exposedAt.length > 0) {
      return `the queue stopped hiding ${where} at ${delivery.exposedAt.join('ms, ')}ms while its handler was still running. A second worker asking for a job at that moment would have been given one somebody was already converting.`;
    }

    if (delivery.outcome === 'idle' && delivery.visibleBefore > 0) {
      return `${delivery.visibleBefore} job(s) were visible and the run answered idle. idle means the queue had nothing to hand out, so a job that was sitting there has been passed over.`;
    }

    if (delivery.outcome !== 'idle' && !delivery.handlerRan) {
      return `a run took a job off the queue, never called the handler, and answered ${delivery.outcome}. Whatever else a delivery does, the work is the point of it.`;
    }
  }

  const stuck = trace.stuck[0];
  if (stuck) {
    return `${stuck.documentId} was still hidden at ${stuck.at}ms, a full visibility timeout after the handler let go of it at ${stuck.endedAt}ms. A job nobody is working on has to come back, and the heartbeat has to stop when the work does.`;
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

const SHRINK_BUDGET = 200;

/** Delta debugging over the script. Every accepted cut shortens it, so this
 *  terminates on its own; the budget is there to bound a slow submission. */
async function shrink(backlog: Backlog): Promise<Backlog> {
  let best = backlog;
  let spent = 0;

  for (const documents of [1, 2]) {
    if (spent >= SHRINK_BUDGET || documents >= best.documents) continue;
    spent += 1;
    const candidate = { ...best, documents };
    if (await check(candidate)) best = candidate;
  }

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

  return best;
}

function describeWork(work: Work): string {
  if (work.kind === 'slow') return `slow ${work.steps}x${work.stepMs}ms then ${work.then}`;
  return work.kind;
}

function describeOp(op: Op): string {
  if (op.kind === 'advance') return `advance ${op.ms}ms`;
  return `run(${describeWork(op.work)}${op.ackDies ? ', ack dies' : ''})`;
}

/**
 * Six non-blank lines reach the panel, so the rule goes first and the
 * reproduction is what gets cut. The whole script is one line for the same
 * reason.
 */
function report(backlog: Backlog, message: string): string {
  const { visibilityTimeoutMs, heartbeatMs, maxReceiveCount } = backlog.options;
  return [
    message,
    `visibility ${visibilityTimeoutMs}ms, heartbeat ${heartbeatMs}ms, maxReceiveCount ${maxReceiveCount}, ${backlog.documents} document(s), seed ${backlog.seed}`,
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
