/**
 * The other four checkpoints drive schedules somebody chose. This one generates
 * the schedule, the keys and the TTL, records every computation the cache
 * started and every answer a caller got, and reads the rules off that trace.
 * Nothing in here knows how a cache works, so there is no second cache to keep
 * in step with the first.
 *
 * What the other four hold fixed without saying so is the clock: none of them
 * moves it while a computation is in flight. On a schedule like that a value
 * dated from the moment its computation started and a value dated from the
 * moment it finished are the same value, and only the second is what the brief
 * asks for. These schedules move the clock across a computation, which is what
 * four seconds of report building does every time it runs.
 *
 * Everything is seeded. Nothing calls `Math.random`, so a failure reproduces on
 * the next run and on someone else's machine.
 */

import { Cache } from '../../src/lib/cache';
import { Clock } from '../../src/lib/clock';
import { deferred, type Deferred } from './deferred';

export type Op =
  | { kind: 'get'; key: string }
  /** Settles the `pick`th computation still running, and does nothing if none is. */
  | { kind: 'settle'; pick: number; outcome: 'value' | 'error' }
  | { kind: 'advance'; ms: number };

export interface Scenario {
  ttlMs: number;
  keys: string[];
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

const TTLS = [1_000, 30_000, 60_000];
const KEY_SETS = [['report'], ['report'], ['report', 'summary']];

export function generateScenarios(seed: number, count: number): Scenario[] {
  const next = random(seed);

  return Array.from({ length: count }, () => {
    const ttlMs = pick(next, TTLS);
    const keys = pick(next, KEY_SETS);

    // The advances worth making are the ones that land either side of a
    // deadline, so they come off the boundary rather than out of a range.
    const advances = [1, ttlMs >> 2, ttlMs >> 1, ttlMs - 1, ttlMs, ttlMs + 1, ttlMs * 2];

    // Most of them open with a computation the clock runs across, because that
    // is the state every rule below is about and a loose script reaches it
    // rarely. Unbiased, a value dated from the wrong end of its computation
    // takes 94 scenarios to surface on one of these seeds and 43 on the other;
    // biased, it takes four and three.
    const prefix: Op[] =
      next() < 0.6
        ? [
            { kind: 'get', key: keys[0] },
            { kind: 'advance', ms: pick(next, advances) },
            { kind: 'settle', pick: 0, outcome: 'value' },
          ]
        : [];

    const length = 5 + Math.floor(next() * 5);
    const tail = Array.from({ length }, (): Op => {
      const roll = next();
      if (roll < 0.42) return { kind: 'get', key: pick(next, keys) };
      if (roll < 0.57) return { kind: 'settle', pick: Math.floor(next() * 3), outcome: 'value' };
      if (roll < 0.72) return { kind: 'settle', pick: Math.floor(next() * 3), outcome: 'error' };
      return { kind: 'advance', ms: pick(next, advances) };
    });

    return { ttlMs, keys, script: [...prefix, ...tail] };
  });
}

interface Computation {
  id: number;
  key: string;
  startedAt: number;
  startedOn: number;
  settledAt: number | null;
  settledOn: number | null;
  outcome: 'value' | 'error' | null;
  /** Unique, so an answer names the computation it came from and no other. */
  value: string;
  message: string;
  gate: Deferred<string>;
}

type Answer = { kind: 'value'; value: unknown } | { kind: 'error'; message: string };

interface Call {
  id: number;
  key: string;
  startedAt: number;
  startedOn: number;
  answer: Answer | null;
}

interface Trace {
  computations: Computation[];
  calls: Call[];
  steps: string[];
}

/**
 * Ordering inside one instant. The clock only moves when a step moves it, so
 * most of a schedule happens at the same millisecond and "which came first" has
 * to be counted rather than timed.
 */
function counter(): () => number {
  let n = 0;
  return () => (n += 1);
}

/** Nothing in a cache built out of promises needs longer than this to propagate. */
async function drain(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

/** A real macrotask, paid for only where a caller is still waiting without one. */
function macrotask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function runScenario(scenario: Scenario): Promise<Trace> {
  const clock = new Clock();
  const cache = new Cache({ ttlMs: scenario.ttlMs }, clock);
  const computations: Computation[] = [];
  const calls: Call[] = [];
  const steps: string[] = [];
  const tick = counter();

  const startCall = (key: string): void => {
    const call: Call = {
      id: calls.length + 1,
      key,
      startedAt: clock.now(),
      startedOn: tick(),
      answer: null,
    };
    calls.push(call);

    const compute = (): Promise<string> => {
      const id = computations.length + 1;
      const computation: Computation = {
        id,
        key,
        startedAt: clock.now(),
        startedOn: tick(),
        settledAt: null,
        settledOn: null,
        outcome: null,
        value: `${key} #${id}`,
        message: `${key} #${id} could not be built`,
        gate: deferred<string>(),
      };
      computations.push(computation);
      return computation.gate.promise;
    };

    void Promise.resolve(cache.get(key, compute)).then(
      (value) => {
        call.answer = { kind: 'value', value };
      },
      (error: unknown) => {
        call.answer = {
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    );
  };

  const settle = (computation: Computation, outcome: 'value' | 'error'): void => {
    computation.settledAt = clock.now();
    computation.settledOn = tick();
    computation.outcome = outcome;
    if (outcome === 'value') computation.gate.resolve(computation.value);
    else computation.gate.reject(new Error(computation.message));
  };

  const running = (): Computation[] => computations.filter((c) => c.outcome === null);
  const waiting = (): boolean => calls.some((call) => call.answer === null);

  for (const op of scenario.script) {
    if (op.kind === 'get') {
      const before = computations.length;
      startCall(op.key);
      await drain();
      const started = computations.length > before ? ` [computation ${computations.length}]` : '';
      steps.push(`get('${op.key}')${started}`);
      continue;
    }

    if (op.kind === 'advance') {
      await clock.advance(op.ms);
      await drain();
      steps.push(`advance(${op.ms})`);
      continue;
    }

    const inFlight = running();
    if (inFlight.length === 0) {
      steps.push('settle(nothing was running)');
      continue;
    }
    const target = inFlight[op.pick % inFlight.length];
    settle(target, op.outcome);
    await drain();
    steps.push(`settle(computation ${target.id}, ${op.outcome})`);
  }

  // Every computation finishes and everything waiting gets to run, so a caller
  // still holding nothing after this is one the cache lost rather than one the
  // schedule never answered.
  for (let round = 0; round < 3; round += 1) {
    for (const computation of running()) settle(computation, 'value');
    await drain();
    if (!waiting() && running().length === 0) break;
    await macrotask();
    await drain();
  }

  return { computations, calls, steps };
}

/**
 * Every rule here is a sentence from the brief, read off the trace. Both halves
 * are covered on purpose. Two computations running for one key at once is what
 * a safety rule catches, and it is the half anybody thinks of. A cache that
 * rebuilds a value it could still have served, hands back one it should have
 * dropped, or leaves a caller holding nothing breaks nothing a safety rule can
 * see, and three of the rules below are here only for those.
 */
function violation(scenario: Scenario, trace: Trace): string | null {
  const { ttlMs } = scenario;
  const { computations, calls } = trace;

  const finished = computations.filter(isSettled);

  /** The newest value the cache had for `key` by tick `on`, and nothing later. */
  const storedBy = (key: string, on: number): Settled | null =>
    finished
      .filter((c) => c.key === key && c.outcome === 'value' && c.settledOn < on)
      .sort((a, b) => a.settledOn - b.settledOn)
      .at(-1) ?? null;

  for (const computation of computations) {
    const overlapping = computations.find(
      (other) =>
        other.key === computation.key &&
        other.id !== computation.id &&
        other.startedOn < computation.startedOn &&
        (other.settledOn === null || other.settledOn > computation.startedOn)
    );
    if (overlapping) {
      return `computation ${computation.id} for '${computation.key}' started while computation ${overlapping.id} for the same key was still running. Two callers for one key are meant to produce one computation and one waiter.`;
    }

    const stored = storedBy(computation.key, computation.startedOn);
    if (stored) {
      const age = computation.startedAt - stored.settledAt;
      if (age < ttlMs) {
        return `'${computation.key}' was rebuilt at ${computation.startedAt}ms by computation ${computation.id}, and computation ${stored.id} had finished it at ${stored.settledAt}ms. The deadline runs for ${ttlMs}ms from the moment a computation finishes, so that value still had ${ttlMs - age}ms left and should have been served from memory.`;
      }
    }
  }

  for (const call of calls) {
    const answer = call.answer;
    const asked = `caller ${call.id} asked for '${call.key}' at ${call.startedAt}ms and`;

    if (answer === null) {
      return `${asked} never got an answer, with every computation finished. A caller waiting on a computation settles when it does.`;
    }

    if (answer.kind === 'error') {
      const failed = finished.filter(
        (c) => c.key === call.key && c.outcome === 'error' && c.settledOn > call.startedOn
      );
      if (failed.length === 0) {
        return `${asked} was rejected with "${answer.message}", and no computation for '${call.key}' was running when it arrived or started for it. A failure is not stored, so the caller after one gets a fresh attempt rather than the old error.`;
      }
      if (!failed.some((c) => c.message === answer.message)) {
        return `${asked} was rejected with "${answer.message}", which is not what the computation it was waiting on threw. Everyone waiting on a failed computation gets its error.`;
      }
      continue;
    }

    const from = computations.find((c) => c.outcome === 'value' && c.value === answer.value);
    if (!from) {
      return `${asked} got ${print(answer.value)}, which no computation produced. Only a computed value is served.`;
    }
    if (from.key !== call.key) {
      return `${asked} got ${print(answer.value)}, which computation ${from.id} built for '${from.key}'. Each key has its own value and its own deadline.`;
    }
    if (isSettled(from) && from.settledOn < call.startedOn) {
      const age = call.startedAt - from.settledAt;
      if (age >= ttlMs) {
        return `${asked} got the value computation ${from.id} finished at ${from.settledAt}ms, which was ${age}ms old against a ${ttlMs}ms deadline. Once the deadline has passed the value is gone and the key is rebuilt.`;
      }
    }
  }

  return null;
}

type Settled = Computation & { settledAt: number; settledOn: number };

function isSettled(computation: Computation): computation is Settled {
  return computation.settledAt !== null && computation.settledOn !== null;
}

function print(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

async function check(scenario: Scenario): Promise<string | null> {
  try {
    return violation(scenario, await runScenario(scenario));
  } catch (error) {
    return `the schedule threw before it finished: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Delta debugging over the schedule: drop the largest block of steps that keeps
 * the rule broken, then halve the block and go again. Every accepted cut
 * shortens the script, so this terminates on its own; the budget bounds a
 * submission slow enough to make each attempt expensive.
 */
const SHRINK_BUDGET = 200;

async function shrink(scenario: Scenario): Promise<Scenario> {
  let best = scenario;
  let budget = SHRINK_BUDGET;

  for (let block = Math.max(1, best.script.length >> 1); block >= 1; block >>= 1) {
    let from = 0;
    while (from + block <= best.script.length && budget > 0) {
      const script = [...best.script.slice(0, from), ...best.script.slice(from + block)];
      budget -= 1;
      if (script.length > 0 && (await check({ ...best, script }))) best = { ...best, script };
      else from += 1;
    }
  }

  return best;
}

/**
 * The report is the point of the checkpoint, and it is four lines because the
 * run report keeps the first six of a failure and drops the rest. The shortest
 * schedule that still breaks a rule, written as the steps that actually ran,
 * and then the rule that broke.
 */
async function report(scenario: Scenario): Promise<string> {
  let steps: string[] = [];
  let message: string;

  try {
    const trace = await runScenario(scenario);
    steps = trace.steps;
    message = violation(scenario, trace) ?? 'no rule broke the second time around';
  } catch (error) {
    message = `the schedule threw: ${error instanceof Error ? error.message : String(error)}`;
  }

  return [
    'The cache broke one of its own rules on this schedule:',
    '',
    `  ttlMs ${scenario.ttlMs}`,
    `  ${steps.join(', ')}`,
    '',
    `  ${message}`,
  ].join('\n');
}

/**
 * Runs the scenarios and returns a report for the first one that breaks a rule,
 * or null when every one of them held.
 */
export async function firstViolation(scenarios: readonly Scenario[]): Promise<string | null> {
  for (const scenario of scenarios) {
    if (!(await check(scenario))) continue;
    return report(await shrink(scenario));
  }
  return null;
}
