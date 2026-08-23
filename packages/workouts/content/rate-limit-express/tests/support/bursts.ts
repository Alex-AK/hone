import request from 'supertest';

import { createApp } from '../../src/server/app';
import { FakeRedis } from '../../src/server/fake-redis';

/**
 * Bursts nobody wrote, for the fifth checkpoint.
 *
 * The other four run every single test at five requests per sixty seconds, so a
 * limiter that ignores the options it was handed and bakes those two numbers in
 * is indistinguishable from a right one. They also read `Retry-After` without
 * ever obeying it: they check it is a whole number inside the window and never
 * come back when it says to. These bursts move the limit, the window, how many
 * clients are spending and where in the window each request lands, and they
 * take the limiter at its word about when to return.
 *
 * There is no second limiter in here. What is modelled is the contract, not the
 * mechanism: when a client's window opened and how many it has spent in it come
 * from the brief's own definition and from the ops this burst emitted, the same
 * way `retry-with-backoff-node` computes an expected wait from the formula on
 * its page. Nothing here knows what a Redis key is.
 *
 * Everything is seeded. Nothing calls `Math.random`, so a failure reproduces on
 * the next run and on someone else's machine.
 */

interface Options {
  limit: number;
  windowSeconds: number;
}

type Op = { kind: 'send'; client: string } | { kind: 'advance'; seconds: number };

export interface Burst {
  seed: number;
  options: Options;
  clients: string[];
  ops: Op[];
}

/** One answer, as it came back. */
interface Answer {
  /** Seconds into the burst, which is the only clock anything here has. */
  at: number;
  client: string;
  status: number;
  limitHeader: string | undefined;
  remaining: string | undefined;
  reset: string | undefined;
  retryAfter: string | undefined;
  reachedHandler: boolean;
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

// Repeats are the weighting. A limit of one reaches the refusal on the second
// request, which is the shortest burst that gets anywhere near `Retry-After`.
const LIMITS = [1, 1, 2, 3, 3, 5, 8] as const;
const WINDOWS = [5, 10, 30, 60, 120] as const;

function makeBurst(next: () => number, seed: number): Burst {
  const options = { limit: pick(next, LIMITS), windowSeconds: pick(next, WINDOWS) };
  const clients = ['alpha', 'beta', 'gamma'].slice(0, 1 + Math.floor(next() * 3));
  const opCount = 4 + Math.floor(next() * 8);
  const ops: Op[] = [];

  for (let index = 0; index < opCount; index += 1) {
    if (next() < 0.25) {
      // The waits worth making land either side of a turnover.
      const spans = [
        1,
        Math.max(1, Math.floor(options.windowSeconds / 2)),
        options.windowSeconds - 1,
        options.windowSeconds,
        options.windowSeconds + 1,
      ];
      ops.push({ kind: 'advance', seconds: pick(next, spans) });
      continue;
    }
    ops.push({ client: pick(next, clients), kind: 'send' });
  }
  return { clients, ops, options, seed };
}

export function generateBursts(seed: number, count: number): Burst[] {
  const next = random(seed);
  const bursts: Burst[] = [];

  // Unbiased, a burst that spends a whole allowance and gets refused takes 16
  // bursts to reach on one of these seeds and 7 on the other, and every rule
  // about `Retry-After` is waiting for a refusal. Forced, it is the first two.
  for (let index = 0; index < 2; index += 1) {
    bursts.push({
      clients: ['alpha'],
      ops: [
        { client: 'alpha', kind: 'send' },
        { client: 'alpha', kind: 'send' },
        { client: 'alpha', kind: 'send' },
      ],
      options: { limit: pick(next, [1, 2]), windowSeconds: pick(next, [5, 10]) },
      seed,
    });
  }

  while (bursts.length < count) bursts.push(makeBurst(next, seed));
  return bursts;
}

async function runBurst(burst: Burst, extra: Op[] = []): Promise<Answer[]> {
  const redis = new FakeRedis();
  const app = createApp(redis, burst.options);
  // A listening server, handed to supertest once. `request(app)` binds a fresh
  // ephemeral port per call, and a burst is a loop of calls.
  const server = app.listen(0);
  const answers: Answer[] = [];
  let at = 0;

  try {
    for (const op of [...burst.ops, ...extra]) {
      if (op.kind === 'advance') {
        redis.advanceTime(op.seconds);
        at += op.seconds;
        continue;
      }

      const before = app.locals.handled as number;
      const response = await request(server)
        .post('/messages')
        .set('X-API-Key', op.client)
        .send({ text: 'hi' });

      answers.push({
        at,
        client: op.client,
        limitHeader: response.headers['ratelimit-limit'],
        reachedHandler: (app.locals.handled as number) > before,
        remaining: response.headers['ratelimit-remaining'],
        reset: response.headers['ratelimit-reset'],
        retryAfter: response.headers['retry-after'],
        status: response.status,
      });
    }
  } finally {
    server.close();
  }
  return answers;
}

/**
 * The rules a single run of a burst can answer. Everything about `Retry-After`
 * needs a second run and is below.
 */
function violation(burst: Burst, answers: Answer[]): string | null {
  const { limit, windowSeconds } = burst.options;
  const spent = new Map<string, number>();
  const openedAt = new Map<string, number>();

  for (const answer of answers) {
    const where = `the request ${answer.client} made at second ${answer.at}`;

    if (answer.limitHeader !== String(limit)) {
      return `${where} came back saying the allowance is ${answer.limitHeader}, and this limiter was built with a limit of ${limit}. The header is the number a caller budgets against, so it is the one you were configured with rather than one written into the code.`;
    }

    let opened = openedAt.get(answer.client);
    if (opened === undefined || answer.at >= opened + windowSeconds) {
      opened = answer.at;
      openedAt.set(answer.client, opened);
      spent.set(answer.client, 0);
    }
    const used = (spent.get(answer.client) ?? 0) + 1;
    spent.set(answer.client, used);

    const reset = Number(answer.reset);
    // Whole seconds, and requests here take under a millisecond, so the only
    // slack this needs is for a real-clock second boundary landing mid-burst.
    if (!Number.isInteger(reset) || Math.abs(reset - (windowSeconds - (answer.at - opened))) > 1) {
      return `${where} reported RateLimit-Reset as ${answer.reset}, and its window opened at second ${opened} and lasts ${windowSeconds}. Reset is whole seconds until this client's window turns over, so it counts down as the window is spent rather than restating how long a window is.`;
    }

    if (used <= limit && answer.status !== 201) {
      return `${where} was request ${used} of ${limit} in the window that opened at second ${opened}, and it was answered ${answer.status}. A client keeps its whole allowance, and a window that opened on its first request runs ${windowSeconds} seconds from there whatever arrives in the meantime.`;
    }
    if (used > limit && answer.status !== 429) {
      return `${where} was request ${used} in a window that allows ${limit}, and it was answered ${answer.status}. Once the allowance is gone the client is turned away until the window turns over.`;
    }
    if (answer.status === 429 && answer.reachedHandler) {
      return `${where} was answered 429 and reached the handler anyway. Express drops the second response, so from outside this looks right; the work behind the limiter still happened.`;
    }
    if (answer.status === 429 && answer.remaining !== '0') {
      return `${where} was turned away and reported ${answer.remaining} remaining. Nothing is left of the allowance at that point, and a negative number is not an amount a caller can do anything with.`;
    }
    if (answer.status === 201 && answer.remaining !== String(limit - used)) {
      return `${where} was request ${used} of ${limit} and reported ${answer.remaining} remaining. Remaining is the allowance minus what has been spent, counted the same way the refusal counts it.`;
    }
  }

  return null;
}

/** Where in `ops` the nth send is, so a prefix can be replayed up to it. */
function upToSend(ops: Op[], nth: number): Op[] {
  let sends = 0;
  for (let index = 0; index < ops.length; index += 1) {
    if (ops[index]?.kind !== 'send') continue;
    if (sends === nth) return ops.slice(0, index + 1);
    sends += 1;
  }
  return ops;
}

/**
 * `Retry-After` is a promise with two halves: come back then and you are let
 * in, come back sooner and you are not. Both are checked by replaying the burst
 * up to the refusal with a wait on the end, because a probe request would spend
 * the allowance it is asking about.
 */
async function retryAfterViolation(burst: Burst, answers: Answer[]): Promise<string | null> {
  const refused = answers.findIndex((answer) => answer.status === 429);
  if (refused === -1) return null;
  const answer = answers[refused] as Answer;
  const told = Number(answer.retryAfter);
  const { windowSeconds } = burst.options;

  if (!Number.isInteger(told) || told <= 0 || told > windowSeconds) {
    return `the request ${answer.client} made at second ${answer.at} was turned away with Retry-After: ${answer.retryAfter}. That is whole seconds, it is never zero or less, and it is never longer than the ${windowSeconds} second window it is waiting out.`;
  }

  const prefix = upToSend(burst.ops, refused);

  const onTime = await runBurst({ ...burst, ops: prefix }, [
    { kind: 'advance', seconds: told },
    { client: answer.client, kind: 'send' },
  ]);
  if (onTime.at(-1)?.status !== 201) {
    return `${answer.client} was turned away at second ${answer.at} and told to come back after ${told} seconds. It waited exactly that long, came back, and was turned away again. Retry-After is the moment a client is welcome, so one that obeys it is not punished for it.`;
  }

  if (told > 1) {
    const early = await runBurst({ ...burst, ops: prefix }, [
      { kind: 'advance', seconds: told - 1 },
      { client: answer.client, kind: 'send' },
    ]);
    if (early.at(-1)?.status === 201) {
      return `${answer.client} was told to wait ${told} seconds, came back after ${told - 1}, and was let straight through. A Retry-After that overshoots costs the caller ${told - 1} seconds of an allowance it had already earned back.`;
    }
  }

  return null;
}

async function check(burst: Burst): Promise<string | null> {
  try {
    const answers = await runBurst(burst);
    return violation(burst, answers) ?? (await retryAfterViolation(burst, answers));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const SHRINK_BUDGET = 60;

/** Delta debugging over the ops. Every accepted cut shortens the burst, so this
 *  terminates on its own; the budget is there because each attempt is a server
 *  and a handful of requests. */
async function shrink(burst: Burst): Promise<Burst> {
  let best = burst;
  let spent = 0;

  for (let block = Math.max(1, best.ops.length >> 1); block >= 1; block >>= 1) {
    let from = 0;
    while (from + block <= best.ops.length && spent < SHRINK_BUDGET) {
      spent += 1;
      const ops = [...best.ops.slice(0, from), ...best.ops.slice(from + block)];
      if (ops.length > 0 && (await check({ ...best, ops }))) best = { ...best, ops };
      else from += 1;
    }
  }

  return best;
}

/**
 * Six non-blank lines reach the panel, so the rule goes first and the burst is
 * what gets cut. The ops are one line for the same reason.
 */
function report(burst: Burst, message: string): string {
  return [
    message,
    `limit ${burst.options.limit} per ${burst.options.windowSeconds}s, seed ${burst.seed}`,
    burst.ops.map((op) => (op.kind === 'advance' ? `wait ${op.seconds}s` : op.client)).join(' → '),
  ].join('\n\n');
}

export async function firstViolation(bursts: Burst[]): Promise<string | null> {
  for (const burst of bursts) {
    const message = await check(burst);
    if (!message) continue;
    const smallest = await shrink(burst);
    return report(smallest, (await check(smallest)) ?? message);
  }
  return null;
}
