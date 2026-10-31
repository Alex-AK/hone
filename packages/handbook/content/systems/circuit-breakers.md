---
title: Circuit breakers
question: One slow dependency is taking the whole service down. What stops that?
order: 6
practise:
  - sys-timeout-before-breaker
  - sys-circuit-breaker
  - circuit-breaker-node
sources:
  - author: Martin Fowler
    title: CircuitBreaker
    url: https://martinfowler.com/bliki/CircuitBreaker.html
  - author: Microsoft
    title: Circuit Breaker pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
  - author: Microsoft
    title: Bulkhead pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead
  - author: Marc Brooker
    title: Will circuit breakers solve my problems?
    url: https://brooker.co.za/blog/2022/02/16/circuit-breakers.html
verified: 2026-08-01
---

Your service calls other services, and one of them can stop answering without ever sending back an
error. Every call to it then sits waiting and holding resources, until requests to unrelated parts
of your service are queueing behind them. A circuit breaker notices the failures and starts refusing
those calls straight away, so the rest of the service stays up.

## The model

Start with why it exists, because the mechanism is the easy half.

A call to a dead dependency is not free. It holds a connection from the pool and a thread, or an
event-loop slot and everything the pending closure is keeping alive, until the timeout fires thirty
seconds later. Requests keep arriving faster than that, so the waiting calls stack up, and the
dependency's failure arrives back in your service as exhausted capacity. Endpoints that never touch
that dependency start queueing behind the ones that do. Nothing in your own code is wrong.

Failing fast gives the capacity back. A circuit breaker is the piece that decides when to fail fast,
and it has three states:

- **Closed** — calls go through and their outcomes are counted. Enough failures in the window and it
  trips.
- **Open** — calls return an error immediately, without a socket being opened, for a fixed cooldown.
  The dependency receives nothing from you, which is also what gives it room to recover.
- **Half-open** — after the cooldown, a small number of trial calls are allowed through. Success
  closes the breaker and resets the counters; failure re-opens it and restarts the cooldown.

The immediate error is the thing you build on: serve a cached value, drop the feature out of the
response, or return a clear failure in three milliseconds instead of thirty seconds. The call still
does not succeed. Your service stays up and keeps answering, which is the point.

Two things the mechanism depends on. The first is a **timeout**. A breaker counts failures, and a
call that has not returned has not failed yet, so without a per-call deadline the counter never
reaches its threshold and the pile-up happens with the breaker sitting closed, watching. The
deadline comes first: [failure and retries](../server-runtime/failure-and-retries.md) is where that
decision lives, along with backoff and jitter.

The second is **not retrying into it**. Retries and breakers pull in opposite directions. A retry
adds load to something already failing, and spends three times the capacity to learn what one call
would have told you. The breaker goes outside the retry, so that an open breaker short-circuits
before the loop is ever entered.

**Bulkheads** are the complementary idea: give each dependency its own connection pool and
concurrency limit, so calls waiting on a sick one can never consume more than that dependency's
share. The breaker stops the calls once it has noticed. The bulkhead caps the damage they can do
before it does.

## Worked example

One breaker, from healthy to recovered. The policy here is a threshold of more than half the calls
in a 20-call window, a 30-second cooldown, and one trial call.

```
closed     120 calls, 4 timeouts        under the threshold, calls pass through
closed     next 20 calls, 13 time out   65% failed, over the threshold
open       09:14:03  trips              calls return at once, no socket opened
open       09:14:03 → 09:14:33          cooldown; the dependency sees nothing from us
half-open  09:14:33  one trial call     the only call allowed through
           trial succeeds → closed      counters reset, full traffic resumes
           trial fails    → open        cooldown restarts, no more trials until it ends
```

What the caller does with an open breaker is the whole value of having one:

```js
// Three milliseconds and a degraded page, instead of thirty seconds and a queue.
if (breaker.isOpen()) return cached(userId) ?? { recommendations: [] };
```

## Traps

**The service fell over and the breaker never tripped.** The calls had no timeout, so they were not
failures yet, they were still waiting, and a failure counter counts failures. Put a per-call
deadline on the dependency first; the breaker measures what the deadline produces.

**Turning on retries made the outage worse.** Three attempts inside the breaker turn one call to a
failing dependency into three: triple the load on something already struggling, and triple the
capacity spent finding out the same thing. Check the breaker before entering the retry loop, not
inside it, and cap the attempts at one layer.

**One dependency is down and every endpoint is failing.** All the outbound calls share a single
connection or thread pool, so the calls to the sick dependency took all of it and healthy work could
not get a slot. That is the bulkhead: a pool per dependency, sized so one dependency's failure can
only ever cost you its own share.

**The breaker flaps open and closed all day on a dependency that is fine.** The threshold is a
percentage with no minimum volume, so an endpoint doing two calls a minute trips on a single
failure. Require a minimum number of calls in the window before the rate is allowed to trip
anything.

**One shard went down and the breaker cut off all twelve.** The counter is per dependency, and the
dependency is not one thing: the calls that failed were the ones routed to a single unhealthy shard
or cell, and the breaker cannot tell those apart from the healthy ones behind the same client. Marc
Brooker's objection is that a breaker in that position has no good answer available, since saying the
dependency is down makes things worse for everyone it was working for, and saying it is up is the
same as not having a breaker. Key the breaker to what actually fails together, one per shard or per
cell, or use a per-call token bucket that limits retries without ever declaring the whole dependency
dead.
