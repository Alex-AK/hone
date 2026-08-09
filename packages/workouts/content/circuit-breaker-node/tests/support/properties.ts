/**
 * The other four checkpoints drive the breaker through schedules somebody chose.
 * This one generates the schedule and the options, then asks whether the run
 * broke any rule the brief states. Nothing here knows how a breaker works: every
 * check reads the trace of what happened, so there is no second implementation
 * to keep in step with the first.
 *
 * That matters because `json-parser` got its generated checkpoint for free, from
 * an oracle in the standard library, and nothing else here has one. What a
 * breaker has instead is a contract that holds whatever the schedule was.
 *
 * Everything is seeded. Nothing calls `Math.random`, so a failure reproduces on
 * the next run and on someone else's machine.
 */

import { type BreakerOptions, CircuitBreaker } from '../../src/lib/breaker';
import { Clock } from '../../src/lib/clock';
import { CallTimeoutError, CircuitOpenError } from '../../src/lib/errors';

export type Behaviour = 'succeed' | 'fail' | 'hang';

export type Op = { kind: 'call'; behaviour: Behaviour } | { kind: 'advance'; ms: number };

export interface Scenario {
  options: BreakerOptions;
  script: Op[];
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

const THRESHOLDS = [1, 2, 3, 4];
const OPEN_MS = [500, 1_000, 5_000];
const TIMEOUT_MS = [50, 100, 200];

export function generateScenarios(seed: number, count: number): Scenario[] {
  const next = random(seed);

  return Array.from({ length: count }, () => {
    const options: BreakerOptions = {
      failureThreshold: pick(next, THRESHOLDS),
      openMs: pick(next, OPEN_MS),
      timeoutMs: pick(next, TIMEOUT_MS),
    };

    // The interesting advances are the ones that land either side of the wait,
    // so they are drawn from the boundary rather than from a range.
    const advances = [
      1,
      options.openMs - 1,
      options.openMs,
      options.openMs + 1,
      options.openMs * 2,
      options.timeoutMs,
    ];

    // Half of them start with the circuit already tripped. Left to itself a
    // random script spends most of its length getting there, and every rule is
    // about what happens afterwards: a breaker whose refusals restart the wait
    // took 2000 unbiased scenarios to surface and 80 of these.
    const prefix: Op[] =
      next() < 0.5
        ? Array.from({ length: options.failureThreshold }, () => ({
            kind: 'call' as const,
            behaviour: 'fail' as const,
          }))
        : [];

    const length = 4 + Math.floor(next() * 7);
    const tail = Array.from({ length }, (): Op => {
      const roll = next();
      if (roll < 0.3) return { kind: 'call', behaviour: 'fail' };
      if (roll < 0.5) return { kind: 'call', behaviour: 'succeed' };
      if (roll < 0.6) return { kind: 'call', behaviour: 'hang' };
      return { kind: 'advance', ms: pick(next, advances) };
    });

    return { options, script: [...prefix, ...tail] };
  });
}

type Result = 'value' | 'dependency-error' | 'timeout' | 'refused' | 'other' | 'pending';

interface Event {
  call: number;
  behaviour: Behaviour;
  invoked: boolean;
  startedAt: number;
  settledAt: number;
  result: Result;
}

const NEVER = new Promise<never>(() => undefined);

/**
 * Attached the moment the call is made, and never rejecting, so a call that
 * settles while the clock is being advanced does not spend that gap looking like
 * an unhandled rejection.
 */
function capture<T>(promise: Promise<T>): Promise<T | Error> {
  return promise.then(
    (value) => value,
    (error: unknown) => (error instanceof Error ? error : new Error(String(error)))
  );
}

const SLOW = Symbol('slow');

/**
 * Bounded, because a submission with no timeout would otherwise sit out the
 * suite. Almost every call here settles on the microtask queue, so that is what
 * gets raced first: reaching for `setTimeout` on all of them costs a millisecond
 * each and turns this checkpoint into the slowest thing in the workout.
 */
async function within<T>(captured: Promise<T>): Promise<T | 'pending'> {
  const microtasks = (async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
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

async function trace(scenario: Scenario): Promise<Event[]> {
  const clock = new Clock();
  const breaker = new CircuitBreaker(scenario.options, clock);
  const events: Event[] = [];
  let calls = 0;

  for (const op of scenario.script) {
    if (op.kind === 'advance') {
      await clock.advance(op.ms);
      continue;
    }

    calls += 1;
    let invoked = false;
    const startedAt = clock.now();

    const dependency = async (): Promise<string> => {
      invoked = true;
      if (op.behaviour === 'succeed') return 'value';
      if (op.behaviour === 'fail') throw new Error('upstream is down');
      return NEVER;
    };

    const captured = capture(breaker.call(dependency));
    // A hanging dependency only resolves into a timeout once the clock reaches
    // it, so the driver moves the clock the exact width of the timeout.
    if (op.behaviour === 'hang') await clock.advance(scenario.options.timeoutMs);

    const outcome = await within(captured);

    let result: Result;
    if (outcome === 'pending') result = 'pending';
    else if (outcome instanceof CircuitOpenError) result = 'refused';
    else if (outcome instanceof CallTimeoutError) result = 'timeout';
    else if (outcome instanceof Error)
      result = outcome.message === 'upstream is down' ? 'dependency-error' : 'other';
    else result = outcome === 'value' ? 'value' : 'other';

    events.push({
      call: calls,
      behaviour: op.behaviour,
      invoked,
      startedAt,
      settledAt: clock.now(),
      result,
    });
  }

  return events;
}

/**
 * Every rule here is a sentence from the brief, read off the trace rather than
 * compared against a second breaker. Both directions are covered on purpose: a
 * safety rule catches a breaker that acts before it is allowed to, and only the
 * liveness rule at the top catches one that acts too late.
 */
function violation(scenario: Scenario, events: Event[]): string | null {
  const { failureThreshold, openMs, timeoutMs } = scenario.options;
  let failuresSoFar = 0;
  let lastFailureAt: number | null = null;
  let refusedYet = false;

  for (const event of events) {
    const where = `call ${event.call} (${event.behaviour})`;

    // The dual of the rule below, and the one that catches a circuit which opens
    // late rather than early: once the streak has reached the threshold, the
    // wait is running and nothing gets through until it is over.
    const waiting =
      failuresSoFar >= failureThreshold &&
      lastFailureAt !== null &&
      event.startedAt - lastFailureAt < openMs;

    if (waiting && event.result !== 'refused') {
      const since = lastFailureAt === null ? 0 : event.startedAt - lastFailureAt;
      const run = `${failuresSoFar} failure${failuresSoFar === 1 ? '' : 's'} in a row`;
      return `${where} reached the dependency ${since}ms after ${run}, with a threshold of ${failureThreshold} and a ${openMs}ms wait. The circuit should have been open.`;
    }

    if (event.result === 'pending') {
      return `${where} never settled. A call that reaches a dependency which never answers has to end at the ${timeoutMs}ms timeout.`;
    }

    if (event.result === 'refused' && event.invoked) {
      return `${where} was refused with CircuitOpenError, but the dependency was called anyway. An open circuit is meant to save that call.`;
    }

    if (event.result === 'refused') {
      if (!refusedYet && failuresSoFar < failureThreshold) {
        return `${where} was refused after only ${failuresSoFar} failure${failuresSoFar === 1 ? '' : 's'}, and the threshold is ${failureThreshold}.`;
      }
      if (lastFailureAt !== null && event.startedAt - lastFailureAt >= openMs) {
        return `${where} was refused ${event.startedAt - lastFailureAt}ms after the last failure, and the circuit only stays open for ${openMs}ms.`;
      }
      refusedYet = true;
      continue;
    }

    if (!event.invoked) {
      return `${where} neither reached the dependency nor came back as CircuitOpenError. It returned ${event.result}.`;
    }

    if (event.behaviour === 'hang') {
      if (event.result !== 'timeout') {
        return `${where} hung, and the call came back as ${event.result} rather than CallTimeoutError. Without the timeout, a dependency that never answers never trips the counter.`;
      }
      if (event.settledAt - event.startedAt > timeoutMs) {
        return `${where} ran for ${event.settledAt - event.startedAt}ms before giving up, and the timeout is ${timeoutMs}ms.`;
      }
    }

    if (event.behaviour === 'succeed' && event.result !== 'value') {
      return `${where} reached a dependency that resolved, and the call came back as ${event.result}. A closed circuit passes the value through untouched.`;
    }

    if (event.behaviour === 'fail' && event.result !== 'dependency-error') {
      return `${where} reached a dependency that threw, and the call came back as ${event.result}. The dependency's own error is what the caller should see.`;
    }

    if (event.result === 'value') {
      failuresSoFar = 0;
      lastFailureAt = null;
      refusedYet = false;
    } else {
      failuresSoFar += 1;
      lastFailureAt = event.settledAt;
    }
  }

  return null;
}

async function check(scenario: Scenario): Promise<string | null> {
  try {
    return violation(scenario, await trace(scenario));
  } catch (error) {
    return `the run threw before the schedule finished: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Delta debugging over the schedule: drop the largest block of operations that
 * keeps the rule broken, then halve the block and go again. Every accepted cut
 * shortens the script, so this terminates on its own.
 */
async function shrink(scenario: Scenario): Promise<Scenario> {
  let best = scenario;

  for (let block = Math.max(1, best.script.length >> 1); block >= 1; block >>= 1) {
    let start = 0;
    while (start + block <= best.script.length) {
      const script = [...best.script.slice(0, start), ...best.script.slice(start + block)];
      if (script.length > 0 && (await check({ ...best, script }))) best = { ...best, script };
      else start += 1;
    }
  }

  return best;
}

function printScript(script: Op[]): string {
  return script
    .map((op) => (op.kind === 'advance' ? `advance(${op.ms})` : `call(${op.behaviour})`))
    .join(', ');
}

export async function firstViolation(scenarios: readonly Scenario[]): Promise<string | null> {
  for (const scenario of scenarios) {
    if (!(await check(scenario))) continue;

    const smallest = await shrink(scenario);
    const { failureThreshold, openMs, timeoutMs } = smallest.options;

    return [
      'The breaker broke one of its own rules on this schedule:',
      '',
      `  failureThreshold ${failureThreshold}, openMs ${openMs}, timeoutMs ${timeoutMs}`,
      `  ${printScript(smallest.script)}`,
      '',
      `  ${await check(smallest)}`,
    ].join('\n');
  }

  return null;
}
