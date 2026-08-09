---
title: The dependency behind a port you own
question: Should I wrap Redis, and what does the wrapper have to promise?
order: 3
practise:
  - http-rate-limit-window-expiry
  - node-interface-is-not-a-di-token
  - sys-port-translates-sentinels
  - rate-limit-express
sources:
  - author: Alistair Cockburn
    title: Hexagonal architecture
    url: https://alistair.cockburn.us/hexagonal-architecture/
  - author: Redis
    title: INCR
    url: https://redis.io/docs/latest/commands/incr/
  - author: Redis
    title: TTL
    url: https://redis.io/docs/latest/commands/ttl/
  - author: NestJS
    title: Custom providers
    url: https://docs.nestjs.com/fundamentals/custom-providers
verified: 2026-08-09
---

## The model

A port is an interface stated in your application's vocabulary, over a dependency stated in somebody
else's. `RateLimiter.consume(clientId)` is a port. `RedisClient.incr(key)` is the vendor's API with
your import path on it. Cockburn's intent for the pattern is the test worth remembering: "Allow an
application to equally be driven by users, programs, automated test or batch scripts, and to be
developed and tested in isolation from its eventual run-time devices and databases", where "for each
external device there is an adapter that converts the API definition to the signals needed by that
device and vice versa."

Three things a port buys, and it is worth being honest about which ones you will actually collect.

1. **A substitute you can drive.** "The application can be configured to run decoupled from external
   databases using an in-memory oracle, or mock, database replacement." The part that pays here is
   usually the clock: a fake you own can be told it is sixty seconds later, and a real Redis cannot.
2. **One place the awkward semantics get translated.** Every dependency has a handful of replies
   that mean something other than what they look like, and a port is where they stop.
3. **One edit when the vendor changes.** This is the reason people give for writing a port, and it
   is the one that pays least often. The first two pay every week.

**A port is a promise, not a rename.** An interface whose methods are `get`, `set`, `del`, `incr`
and `expire` has moved nothing: every caller still has to know that a counter and its deadline are
two commands, and every caller can get that wrong separately. What `consume(clientId)` promises is
that the count and the deadline move together. Redis's own documentation shows why that is a promise
rather than two calls, on the rate-limiter pattern in the `INCR` page: "In the above code there is a
race condition. If for some reason the client performs the `INCR` command but does not perform the
`EXPIRE` the key will be leaked until we'll see the same IP address again." The documented fix is a
Lua script. That is exactly the kind of thing that belongs behind the port and in no calling site at
all.

**The narrowing is the point, and it is also the cost.** A port is deliberately smaller than the
dependency, which means the sorted set or the stream you actually bought Redis for is either named
in the port or unreachable through it. A port that grows a method per feature until it is the
vendor's API again has cost you a file and bought nothing.

**When not to write one.** `JSON.parse` and `crypto.randomUUID` need no port. You will never swap
them, their vocabulary is already yours, and there is nothing awkward to translate. The bar is the
same as any other abstraction: name the second implementation, or name the semantic you are hiding.
"We might swap it one day" is neither.

## Worked example

This repository ships its own answer to the fake half, in
`packages/workouts/content/rate-limit-express/files/server/fake-redis.ts`. It implements six
commands and keeps every reply that catches people out:

```
incr(key)             a missing key starts at 1, with no deadline at all
expire(key, seconds)  0 when there was no key to put a deadline on, 1 otherwise
ttl(key)              seconds left, -1 for "no deadline", -2 for "no key"
advanceTime(seconds)  not Redis. the reason a 60-second window is free to test
```

The first three are Redis. `INCR`: "If the key does not exist, it is set to `0` before performing
the operation", and nothing in that sentence gives the key a deadline. `TTL`: "-1 if the key exists
but has no associated expiration", "-2 if the key does not exist". A fake that answered `null` for
both would be easier to write and would teach an API that does not exist.

The port is where those stop being anybody else's problem:

```ts
// Your vocabulary. Nothing above this line has heard of a -2.
export interface RateLimiter {
  consume(clientId: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}
```

```ts
class RedisRateLimiter implements RateLimiter {
  async consume(clientId: string) {
    const key = `rl:${clientId}`;
    const used = await this.redis.incr(key);
    if (used === 1) await this.redis.expire(key, WINDOW_SECONDS); // only on creation

    const ttl = await this.redis.ttl(key);
    return {
      allowed: used <= LIMIT,
      retryAfterSeconds: ttl >= 0 ? ttl : WINDOW_SECONDS,
    };
  }
}
```

Two lines carry the argument. `used === 1` is the only moment a deadline may be set, because setting
it on every request pushes it out ahead of the traffic and the counter never resets. And `ttl >= 0`
is the sentinel translation: neither -1 nor -2 is a number of seconds. A -2 here means the key
expired between the two calls, so the window has just turned over; a -1 means the `expire` above did
not run, which is a bug worth logging rather than smoothing away. Both are decisions, they are made
once, and every caller gets a number it can put in a header.

## Traps

**The suite is green and one client stays limited forever.** The fake was kinder than the real
thing, so the test never exercised the semantic that fails. This is the failure mode that makes a
fake worth writing or not worth writing at all: it earns its place by keeping the awkward parts,
because those are what the code around it gets wrong. `INCR` creating a key with no deadline is the
canonical one.

**`if (ttl < 30) refresh()` refreshed a key that does not exist.** -2 is less than 30, and so is -1.
Sentinels sort like numbers and are not quantities, so every call site that reads the raw reply is
somewhere the same bug can appear independently. Translating them exactly once is the second thing
on the list of what a port buys, and it is the one you collect this week.

**The container cannot resolve the port.** A TypeScript interface is erased, so there is nothing left
at runtime for a DI container to use as a key, and Nest fails at startup naming a parameter you
thought was typed. Register the adapter under a string or `Symbol` token and inject that; an
abstract class works too, because a class is still a value.
[Dependency injection](../server-runtime/dependency-injection.md) has the mechanism.

**Redis came out, Postgres went in, and the limiter started letting people through.** The port
promised method names, and the code depended on a guarantee nobody wrote down: `INCR` is one atomic
command against a single-threaded server, and `SELECT count` followed by `UPDATE` is two statements
with a gap in the middle. A port's contract is its guarantees, so write them where the interface is,
and test the port rather than the adapter, so both implementations are held to the same sentence.
