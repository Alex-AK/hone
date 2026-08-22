/**
 * The other four checkpoints drive outages somebody chose. This one generates
 * the outage, the options and the request, records every attempt that reached
 * the downstream and everything the client asked the clock for, and reads the
 * rules off that trace. Nothing in here retries anything, so there is no second
 * client to keep in step with the first.
 *
 * What the other four hold fixed without saying so is which failure they use
 * for which rule. Every wait is measured on a run of 503s and every ambiguous
 * failure is a dropped connection, so "wait before sending it again" and "an
 * attempt that got no answer" are never the same attempt, and a timeout is
 * never the ambiguous one. These outages mix them.
 *
 * Everything is seeded. Nothing calls `Math.random`, so a failure reproduces on
 * the next run and on someone else's machine.
 */

import { Clock } from '../../src/lib/clock';
import type { DownstreamResponse, Method, OutboundRequest } from '../../src/lib/downstream';
import { ConnectionLostError, GaveUpError } from '../../src/lib/errors';
import { RetryingClient } from '../../src/lib/retry';

/** What the downstream does with one attempt. The last entry repeats. */
export type Reply =
  { kind: 'answers'; status: number; retryAfter?: number } | { kind: 'drops' } | { kind: 'hangs' };

export interface Options {
  maxAttempts: number;
  baseMs: number;
  capMs: number;
  timeoutMs: number;
  budgetMs: number;
}

export interface Scenario {
  options: Options;
  method: Method;
  idempotencyKey: boolean;
  /** What the clock reads when `request` is called. It is not always zero. */
  startAt: number;
  /** Handed to `random` in order, the last one repeating. */
  randoms: number[];
  script: Reply[];
}

/** The four that mean nobody healthy answered. From the brief, not from a client. */
const RETRYABLE = new Set([429, 502, 503, 504]);

/** The methods where sending it again is the same as sending it once. */
const IDEMPOTENT = new Set<Method>(['DELETE', 'GET', 'PUT']);

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

/** The value at `index`, or the last one, which is how the fixed jitter runs out. */
function at(values: readonly number[], index: number): number {
  return values[Math.min(index, values.length - 1)] ?? 0;
}

const MAX_ATTEMPTS = [2, 2, 3, 3, 4, 4];
const BASE_MS = [50, 100, 400];
const CAP_MULTIPLE = [4, 20];
const TIMEOUT_MS = [100, 250];
const RETRY_AFTER_S = [1, 1, 2, 30];
const ANSWERED = [200, 201, 400, 404, 500];
const START_AT = [0, 0, 0, 1_000, 7_500];
const JITTER = [[0], [1], [0.5], [0.25, 0.75], [1, 0]];

export function generateScenarios(seed: number, count: number): Scenario[] {
  const next = random(seed);

  return Array.from({ length: count }, () => {
    const timeoutMs = pick(next, TIMEOUT_MS);
    const baseMs = pick(next, BASE_MS);
    // Every budget covers at least two attempts, so "no attempt starts that
    // cannot finish" is always a question about the second one and never about
    // whether the client was allowed to start at all. Three of them sit on a
    // whole number of timeouts, which is where an attempt that exactly fits the
    // budget it has left is either allowed or refused; two more come off the
    // backoff instead, because a budget no wait is long enough to reach is one
    // only a downstream that never answers can spend.
    const options: Options = {
      maxAttempts: pick(next, MAX_ATTEMPTS),
      baseMs,
      capMs: baseMs * pick(next, CAP_MULTIPLE),
      timeoutMs,
      budgetMs: pick(next, [
        timeoutMs * 2,
        timeoutMs * 3,
        timeoutMs * 4,
        Math.max(timeoutMs * 2, baseMs * 2),
        Math.max(timeoutMs * 2, baseMs * 6),
        60_000,
      ]),
    };

    const methodRoll = next();
    const method: Method =
      methodRoll < 0.3 ? 'GET' : methodRoll < 0.45 ? 'PUT' : methodRoll < 0.6 ? 'DELETE' : 'POST';

    const draw = (): Reply => {
      const roll = next();
      if (roll < 0.34) return { kind: 'answers', status: pick(next, [...RETRYABLE]) };
      if (roll < 0.46) {
        return {
          kind: 'answers',
          status: pick(next, [...RETRYABLE]),
          retryAfter: pick(next, RETRY_AFTER_S),
        };
      }
      if (roll < 0.64) return { kind: 'drops' };
      if (roll < 0.92) return { kind: 'hangs' };
      return { kind: 'answers', status: pick(next, ANSWERED) };
    };

    // A third of them open with the downstream naming its own wait, because that
    // is the one gap whose length the client does not choose and every window
    // after it is measured from it. Left to itself the tail reaches that pair
    // rarely: a Retry-After has to arrive, be short enough that the budget
    // survives it, and be followed by two more attempts.
    const prefix: Reply[] =
      next() < 0.34 ? [{ kind: 'answers', status: pick(next, [...RETRYABLE]), retryAfter: 1 }] : [];

    // Every rule is about the attempt after a failure, so an outage that never
    // changes what it does spends its length re-running the case the four
    // hand-written checkpoints already cover. One resample halves that without
    // narrowing what can come out: a run of one failure is still reachable, and
    // the last entry repeats for as long as attempts keep arriving.
    const length = 1 + Math.floor(next() * 4);
    const script: Reply[] = [...prefix];
    for (let index = 0; index < length; index += 1) {
      const previous = script[script.length - 1];
      const reply = draw();
      script.push(previous && sameKind(previous, reply) ? draw() : reply);
    }

    return {
      options,
      method,
      idempotencyKey: method === 'POST' && next() < 0.4,
      startAt: pick(next, START_AT),
      randoms: pick(next, JITTER),
      script,
    };
  });
}

/** Two replies the rules read the same way, which is what a resample avoids. */
function sameKind(one: Reply, other: Reply): boolean {
  if (one.kind !== other.kind) return false;
  if (one.kind !== 'answers' || other.kind !== 'answers') return true;
  if ((one.retryAfter === undefined) !== (other.retryAfter === undefined)) return false;
  return RETRYABLE.has(one.status) === RETRYABLE.has(other.status);
}

interface Attempt {
  number: number;
  reply: Reply;
  sentAt: number;
  /** Null while the downstream is still holding it, which a deadline ends. */
  settledAt: number | null;
  /** Null when the attempt came back with no answer at all. */
  status: number | null;
  retryAfterMs: number | null;
  signal: 'none' | 'fresh' | 'spent';
  /** How many times `random` had been asked for a number before this attempt. */
  draws: number;
  /** What actually arrived, so a key dropped on the way out is visible. */
  sent: string;
}

type Result =
  | { kind: 'response'; status: number }
  | { kind: 'gave-up'; reason: string; attempts: number; lastStatus: number | null }
  | { kind: 'other'; description: string }
  | { kind: 'pending' };

interface Trace {
  attempts: Attempt[];
  deadlines: number[];
  result: Result;
}

/** A client that never stops would otherwise sit out the suite rather than fail it. */
const ATTEMPT_LIMIT = 40;

const SLOW = Symbol('slow');

/**
 * Bounded, because a client with no way of giving up would hang here. Almost
 * everything settles on the microtask queue once the clock has been drained, so
 * that is what gets raced first: a `setTimeout` on every scenario costs a
 * millisecond each and this checkpoint runs a hundred of them and more.
 */
async function within<T>(captured: Promise<T>): Promise<T | 'pending'> {
  const microtasks = (async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    return SLOW;
  })();

  const quick = await Promise.race([captured, microtasks]);
  if (quick !== SLOW) return quick as T;

  const ticks = (async () => {
    for (let i = 0; i < 2; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    return 'pending' as const;
  })();

  return Promise.race([captured, ticks]);
}

async function runScenario(scenario: Scenario): Promise<Trace> {
  const clock = new Clock();
  const attempts: Attempt[] = [];
  const draws: number[] = [];

  // The clock does not start at zero, so a budget measured from `budgetMs`
  // rather than from `clock.now()` is a different deadline from the right one.
  if (scenario.startAt > 0) {
    void clock.sleep(scenario.startAt);
    await clock.drain();
  }

  const jitter = (): number => {
    const value = at(scenario.randoms, draws.length);
    draws.push(value);
    return value;
  };

  const send = (request: OutboundRequest, signal?: AbortSignal): Promise<DownstreamResponse> => {
    if (attempts.length >= ATTEMPT_LIMIT) {
      throw new Error(`the client made more than ${ATTEMPT_LIMIT} attempts`);
    }

    const reply = scenario.script[Math.min(attempts.length, scenario.script.length - 1)];
    const attempt: Attempt = {
      number: attempts.length + 1,
      reply,
      sentAt: clock.now(),
      settledAt: null,
      status: null,
      retryAfterMs: null,
      signal: signal === undefined ? 'none' : signal.aborted ? 'spent' : 'fresh',
      draws: draws.length,
      sent: signature(request),
    };
    attempts.push(attempt);

    if (attempt.signal === 'spent') {
      attempt.settledAt = clock.now();
      return Promise.reject(signal?.reason as Error);
    }

    if (reply.kind === 'drops') {
      attempt.settledAt = clock.now();
      return Promise.reject(new ConnectionLostError());
    }

    if (reply.kind === 'answers') {
      attempt.settledAt = clock.now();
      attempt.status = reply.status;
      attempt.retryAfterMs = reply.retryAfter === undefined ? null : reply.retryAfter * 1_000;
      const headers =
        reply.retryAfter === undefined ? {} : { 'retry-after': `${reply.retryAfter}` };
      return Promise.resolve({ status: reply.status, headers, body: { path: request.path } });
    }

    return new Promise<DownstreamResponse>((_resolve, reject) => {
      signal?.addEventListener(
        'abort',
        () => {
          attempt.settledAt = clock.now();
          reject(signal.reason as Error);
        },
        { once: true }
      );
    });
  };

  const request: OutboundRequest = {
    method: scenario.method,
    path: '/charges',
    headers: scenario.idempotencyKey ? { 'idempotency-key': 'ik_7f2' } : {},
  };

  const client = new RetryingClient({ ...scenario.options }, { send, clock, random: jitter });
  const settled = capture(client.request(request));
  await clock.drain();

  return { attempts, deadlines: [...clock.deadlines], result: await within(settled) };
}

/**
 * Attached the moment the call is made, and never rejecting, so a client that
 * gives up while the clock is being drained does not spend that gap looking
 * like an unhandled rejection.
 */
function capture(promise: Promise<DownstreamResponse>): Promise<Result> {
  return promise.then(
    (response): Result =>
      typeof response?.status === 'number'
        ? { kind: 'response', status: response.status }
        : { kind: 'other', description: `${print(response)}, which is not a response` },
    (error: unknown): Result => {
      if (error instanceof GaveUpError) {
        return {
          kind: 'gave-up',
          reason: error.reason,
          attempts: error.attempts,
          lastStatus: error.lastStatus,
        };
      }
      return {
        kind: 'other',
        description: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      };
    }
  );
}

/**
 * Every rule here is a sentence from the brief, read off the trace. Both halves
 * are covered on purpose. A client that sends something it must not, or waits
 * less than it said it would, is what a safety rule catches, and it is the half
 * anybody thinks of. A client that gives up while it still had an attempt and
 * the budget for it breaks nothing a safety rule can see, and the liveness
 * rules near the bottom are the only thing here that catches one.
 */
function violation(scenario: Scenario, trace: Trace): string | null {
  const { baseMs, budgetMs, capMs, maxAttempts, timeoutMs } = scenario.options;
  const { attempts, deadlines, result } = trace;
  const expiresAt = scenario.startAt + budgetMs;
  const safe = IDEMPOTENT.has(scenario.method) || scenario.idempotencyKey;

  if (attempts.length === 0) return 'nothing ever reached the downstream.';
  if (attempts.length > maxAttempts) {
    return `${attempts.length} attempts were made, and maxAttempts is ${maxAttempts}, which counts the first one.`;
  }
  if (attempts[0].sentAt !== scenario.startAt) {
    return `the first attempt was sent ${attempts[0].sentAt - scenario.startAt}ms after the call. Nothing waits before the first attempt.`;
  }

  const asked = signature({
    method: scenario.method,
    path: '/charges',
    headers: scenario.idempotencyKey ? { 'idempotency-key': 'ik_7f2' } : {},
  });

  for (const attempt of attempts) {
    const where = `attempt ${attempt.number}`;

    if (attempt.sent !== asked) {
      return `${where} sent ${attempt.sent} and the caller asked for ${asked}. Every attempt is the same request.`;
    }
    if (attempt.signal === 'none') {
      return `${where} was sent with no deadline on it, so a downstream that never answers ends the call rather than the attempt.`;
    }
    if (attempt.signal === 'spent') {
      return `${where} was handed a deadline that had already fired, so it failed without the downstream ever hearing about it. Every attempt gets its own.`;
    }
    if (attempt.settledAt === null) {
      return `${where} was never called off, and the downstream is still holding it. An attempt runs for at most ${timeoutMs}ms.`;
    }
    if (attempt.reply.kind === 'hangs' && attempt.settledAt - attempt.sentAt !== timeoutMs) {
      return `${where} met a downstream that never answers and ran for ${attempt.settledAt - attempt.sentAt}ms, against a ${timeoutMs}ms deadline.`;
    }
    if (attempt.number > 1 && attempt.sentAt + timeoutMs > expiresAt) {
      return `${where} was sent at ${attempt.sentAt}ms with ${expiresAt - attempt.sentAt}ms of budget left, and an attempt may run for ${timeoutMs}ms. No attempt starts that cannot finish inside the budget.`;
    }
  }

  if (deadlines.length !== attempts.length) {
    return `${attempts.length} attempt${attempts.length === 1 ? ' was' : 's were'} made and ${deadlines.length} deadline${deadlines.length === 1 ? ' was' : 's were'} taken from the clock. Each attempt gets its own, taken inside the loop.`;
  }
  const wrong = deadlines.find((ms) => ms !== timeoutMs);
  if (wrong !== undefined) {
    return `a deadline of ${wrong}ms was taken from the clock, and an attempt may run for ${timeoutMs}ms.`;
  }

  for (const [index, attempt] of attempts.entries()) {
    const next = attempts[index + 1];
    if (next === undefined) break;

    if (attempt.status !== null && !RETRYABLE.has(attempt.status)) {
      return `attempt ${attempt.number} came back ${attempt.status} and the client sent the request again. Every status other than 429, 502, 503 and 504 is the downstream's answer to the caller.`;
    }
    if (attempt.status === null && !safe) {
      return `attempt ${attempt.number} came back with no answer at all and the client sent the request again. What was lost is the answer and not the request, so a ${scenario.method} without an idempotency key stops there.`;
    }

    const settledAt = attempt.settledAt ?? attempt.sentAt;
    const waited = next.sentAt - settledAt;
    const drew = next.draws - attempt.draws;
    const window = Math.min(capMs, baseMs * 2 ** index);

    if (attempt.retryAfterMs !== null) {
      if (drew !== 0) {
        return `the downstream answered ${attempt.status} and named its own wait, and the client asked for jitter anyway. Retry-After replaces the formula rather than joining it.`;
      }
      if (waited !== attempt.retryAfterMs) {
        return `attempt ${attempt.number} came back with Retry-After ${attempt.retryAfterMs / 1_000}, and the client waited ${waited}ms before the next one. That header is how long to wait, exactly.`;
      }
      continue;
    }

    if (drew === 0) {
      return `the client waited ${waited}ms before attempt ${next.number} without asking for jitter at all. Every wait the downstream did not name is one random number times the whole window.`;
    }
    if (drew > 1) {
      return `the client asked for jitter ${drew} times before attempt ${next.number}, and waited ${waited}ms. One wait is one random number times the whole window.`;
    }
    const expected = at(scenario.randoms, attempt.draws) * window;
    if (waited !== expected) {
      return `the client waited ${waited}ms before attempt ${next.number}, and the window there is ${window}ms with a jitter of ${at(scenario.randoms, attempt.draws)}, which is ${expected}ms. The window is baseMs doubled once per wait already made, up to capMs.`;
    }
  }

  const last = attempts[attempts.length - 1];
  const lastRetryable = last.status !== null && RETRYABLE.has(last.status);
  const lastAmbiguous = last.status === null;

  if (!lastRetryable && !lastAmbiguous) {
    if (result.kind !== 'response') {
      return `attempt ${last.number} came back ${last.status} and the caller got ${describe(result)}. A status the downstream chose is the answer, and the client hands it over.`;
    }
    if (result.status !== last.status) {
      return `attempt ${last.number} came back ${last.status} and the caller got a ${result.status}.`;
    }
    return null;
  }

  // What the next attempt would have cost, which is what says whether giving up
  // here was allowed. Both halves come off the trace: the wait is the one the
  // brief prescribes for this gap, and the deadline is the one the client is
  // told no attempt may start without.
  const settledAt = last.settledAt ?? last.sentAt;
  const formulaWait =
    at(scenario.randoms, last.draws) * Math.min(capMs, baseMs * 2 ** (last.number - 1));
  const nextWait = last.retryAfterMs ?? formulaWait;
  const roomLeft = attempts.length < maxAttempts;
  const budgetLeft = settledAt + nextWait + timeoutMs <= expiresAt;

  if (roomLeft && budgetLeft && (lastRetryable || safe)) {
    const why = lastRetryable
      ? `attempt ${last.number} came back ${last.status}, which is the downstream saying it did not run the request`
      : `attempt ${last.number} came back with no answer, and a ${scenario.method}${scenario.idempotencyKey ? ' carrying an idempotency key' : ''} may be sent again`;
    const left = maxAttempts - attempts.length;
    return `${why}. The client stopped with ${left} attempt${left === 1 ? '' : 's'} left and ${expiresAt - settledAt}ms of budget against a ${timeoutMs}ms attempt, and answered ${describe(result)}.`;
  }

  const allowed: string[] = [];
  if (lastAmbiguous && !safe) allowed.push('not-safe-to-retry');
  if (!roomLeft) allowed.push('out-of-attempts');
  if (!budgetLeft) allowed.push('out-of-budget');

  if (result.kind !== 'gave-up') {
    return `the client stopped after attempt ${last.number} and answered ${describe(result)}. Giving up throws GaveUpError, and here the reason is ${list(allowed)}.`;
  }
  if (!allowed.includes(result.reason)) {
    return `the client gave up with reason '${result.reason}' after attempt ${last.number}, and the reason here is ${list(allowed)}.`;
  }
  if (result.attempts !== attempts.length) {
    return `the client gave up saying it made ${result.attempts} attempt${result.attempts === 1 ? '' : 's'}, and ${attempts.length} reached the downstream.`;
  }
  if (result.lastStatus !== last.status) {
    return `the client gave up reporting a last status of ${result.lastStatus ?? 'null'}, and attempt ${last.number} came back ${last.status === null ? 'with no status at all' : `${last.status}`}.`;
  }

  return null;
}

/** Order-independent, so a client that rebuilds the request is not accused of changing it. */
function signature(request: OutboundRequest): string {
  const headers = Object.entries(request.headers ?? {})
    .map(([name, value]) => `${name}: ${value}`)
    .sort();
  return `${request.method} ${request.path}${headers.length === 0 ? '' : ` (${headers.join(', ')})`}`;
}

function print(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function describe(result: Result): string {
  if (result.kind === 'response') return `a ${result.status}`;
  if (result.kind === 'gave-up') return `GaveUpError('${result.reason}')`;
  if (result.kind === 'other') return result.description;
  return 'nothing at all, and was still waiting';
}

function list(reasons: readonly string[]): string {
  if (reasons.length === 0) return 'neither';
  return reasons.map((reason) => `'${reason}'`).join(' or ');
}

async function check(scenario: Scenario): Promise<string | null> {
  try {
    return violation(scenario, await runScenario(scenario));
  } catch (error) {
    return `the call threw before it finished: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Delta debugging over the outage, then over the two settings that are almost
 * never what broke: a clock that did not start at zero and a jitter sequence
 * with more than one number in it. Every accepted cut shortens the report, so
 * this terminates on its own.
 */
async function shrink(scenario: Scenario): Promise<Scenario> {
  let best = scenario;

  for (let block = Math.max(1, best.script.length >> 1); block >= 1; block >>= 1) {
    let from = 0;
    while (from + block <= best.script.length) {
      const script = [...best.script.slice(0, from), ...best.script.slice(from + block)];
      if (script.length > 0 && (await check({ ...best, script }))) best = { ...best, script };
      else from += 1;
    }
  }

  for (const simpler of [{ startAt: 0 }, { randoms: [0] }]) {
    const candidate = { ...best, ...simpler };
    if (await check(candidate)) best = candidate;
  }

  return best;
}

/**
 * The rule comes first because the run report keeps only the first six lines of
 * a failure: everything below it is the reproduction, and that is the half that
 * can afford to be cut.
 */
async function report(scenario: Scenario): Promise<string> {
  const { baseMs, budgetMs, capMs, maxAttempts, timeoutMs } = scenario.options;
  const key = scenario.idempotencyKey ? ' with an idempotency-key header' : '';

  return [
    'The client broke one of its own rules on this outage:',
    '',
    `  ${(await check(scenario)) ?? 'no rule broke the second time around'}`,
    '',
    `  ${scenario.method} /charges${key}, jitter ${scenario.randoms.join(' then ')}, clock at ${scenario.startAt}ms`,
    `  maxAttempts ${maxAttempts}, baseMs ${baseMs}, capMs ${capMs}, timeoutMs ${timeoutMs}, budgetMs ${budgetMs}`,
    `  the downstream: ${scenario.script.map(printReply).join(', ')}`,
  ].join('\n');
}

function printReply(reply: Reply): string {
  if (reply.kind === 'drops') return 'connection dies';
  if (reply.kind === 'hangs') return 'never answers';
  return reply.retryAfter === undefined
    ? `${reply.status}`
    : `${reply.status} retry-after ${reply.retryAfter}`;
}

/**
 * Runs the outages and returns a report for the first one that breaks a rule,
 * or null when every one of them held.
 */
export async function firstViolation(scenarios: readonly Scenario[]): Promise<string | null> {
  for (const scenario of scenarios) {
    if (!(await check(scenario))) continue;
    return report(await shrink(scenario));
  }
  return null;
}
