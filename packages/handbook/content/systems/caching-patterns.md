---
title: Caching patterns
question: Who fills the cache, and what happens the moment it empties?
order: 12
practise:
  - sys-cache-aside-vs-write-through
  - sys-cache-stampede
  - sys-thundering-herd
  - one-recompute-not-fifty
sources:
  - author: Donne Martin
    title: 'System Design Primer: caching'
    url: https://github.com/donnemartin/system-design-primer
  - author: Amazon Web Services
    title: Caching strategies for ElastiCache
    url: https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html
  - author: Redis
    title: SET
    url: https://redis.io/docs/latest/commands/set/
  - author: nginx
    title: 'Module ngx_http_proxy_module: proxy_cache_lock'
    url: https://nginx.org/en/docs/http/ngx_http_proxy_module.html
  - author: IETF
    title: 'RFC 5861: HTTP Cache-Control Extensions for Stale Content'
    url: https://www.rfc-editor.org/rfc/rfc5861.html
  - author: Marc Brooker (AWS)
    title: Exponential backoff and jitter
    url: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
verified: 2026-08-01
---

A cache keeps a copy of slow data somewhere fast, so most requests never reach the database. Who
puts the copy there, and when, decides how out of date it can get. The dangerous moment is when a
popular entry expires: every request that arrives before it is refilled goes to the database at
once.

## The model

Every caching pattern answers one question, who writes to the cache and when, and that answer sets
its staleness, cost and failure mode.

- **Cache-aside (lazy loading)** — the application writes, on a miss. A read checks the cache, and a
  miss reads the database and puts the value back. Writes go straight to the database, so the cached
  copy is wrong from the write until the TTL runs out. AWS sums up the trade: only requested data is
  cached and an empty node is survivable, but a miss costs three trips. This is the default for
  read-heavy data, and it is `sys-cache-aside-vs-write-through`.
- **Read-through** — the cache writes, on a miss. It behaves like cache-aside, but the loading code
  lives behind the cache's `get`, so there is one miss path, not one per call site.
- **Write-through** — the write path writes, synchronously. Every write updates the cache and the
  database together, so a read after a write finds the current value. It costs two trips per write
  and fills the cache with entries nobody reads, so it is normally paired with a TTL.
- **Write-behind (write-back)** — the write path writes, asynchronously. The write lands in the
  cache, the caller is answered, and the database is updated later. Writes are fastest here, and the
  cache is briefly the only copy: lose the node before the flush and you lose acknowledged writes.
- **Refresh-ahead** — a background reload writes, before expiry. A key being read is refreshed as
  its TTL approaches, so it never disappears. It pays off where you can predict what gets asked for.

Which layer the cache sits at is [the layers](../caching/the-layers.md); what the key is and when
the value stops being true are [the hard parts](../caching/the-hard-parts.md).

### The miss

A cache in front of a database turns many requests a second into one query per TTL. When the key is
gone that stops, and it stops when load is highest, because a key is only hot if many readers arrive
inside the time one load takes. Fifty concurrent readers and one expired key make fifty identical
queries. That is a **cache stampede**, and it is `sys-cache-stampede`. Three fixes:

1. **One caller recomputes and the rest wait.** A lock, or single-flight. In Redis that is
   `SET lock:<key> <token> NX EX <seconds>`: `NX` sets the key only if it does not already exist, so
   exactly one caller is answered `OK`, and the expiry releases the lock if that caller dies holding
   it. nginx's `proxy_cache_lock` does the same. The database sees one query; the waiters still
   wait.
2. **Jittered TTLs.** Keys written in the same second expire in the same second. Writing
   `ttl = base + random(spread)` spreads those expiries out, so misses trickle in instead of
   spiking. It is the cheapest fix and the only one that prevents the synchronised case rather than
   surviving it. It does nothing for one genuinely hot key, which has one expiry moment however you
   jitter it.
3. **Serve stale while revalidating.** Keep the expired value and refresh behind it, so one caller
   pays and nobody waits. RFC 5861 says a cache "MAY serve the response in which it appears after it
   becomes stale, up to the indicated number of seconds", which is
   [revalidation](../caching/revalidation.md) at the HTTP layer. It needs a product decision: an
   answer a few hundred milliseconds out of date has to be acceptable.

**A stampede and a thundering herd get called by each other's names, and their fixes are not
interchangeable.** A stampede is many readers and one key, synchronised by a TTL. A thundering herd
is many clients and one moment: a service comes back after an outage, and 10,000 retrying clients
arrive in the same second (`sys-thundering-herd`). No cache is involved, so no cache fix touches it.
The fix is on the caller: exponential backoff so the retry pressure thins out, plus jitter so the
callers stop agreeing on when to try. Both are independent actors accidentally in lockstep, which is
why jitter answers both. Backoff as a retry policy is
[failure and retries](../server-runtime/failure-and-retries.md).

## Worked example

One hot key expiring, under three policies:

```
key pricing:pro    TTL 60s    load 400ms    120 requests a second

no protection
  12:00:00.000  the TTL expires              the key is gone
  12:00:00.000  request 1 misses             starts a 400ms load
  12:00:00.008  request 2 misses             request 1's load has not returned
     ...        requests 3 to 48 miss        each starts its own load
  12:00:00.400  48 loads return              48 identical queries, 48 writes, 1 value

single-flight
  12:00:00.000  the TTL expires
  12:00:00.000  request 1 takes the lock     SET lock:pricing:pro <token> NX EX 10
  12:00:00.008  requests 2 to 48 lose it     they wait on the key instead
  12:00:00.400  request 1 writes, unlocks    one query
  12:00:00.401  requests 2 to 48 read it     up to 400ms of waiting, nothing queued on the database

serve stale while revalidating
  12:00:00.000  the TTL expires              the value is kept and marked stale
  12:00:00.000  request 1 gets the stale value and starts the refresh
  12:00:00.008  requests 2 to 48 get the stale value      nobody waits
  12:00:00.400  the refresh lands            reads from here are current
```

Only the third has nobody waiting, and only the third serves an out-of-date value. Prevention is one
line where the value is written:

```js
// Keys written in the same second must not expire in the same second.
await redis.set(key, value, { EX: 300 + Math.floor(Math.random() * 60) });
```

## Traps

**A write went in and readers kept seeing the old value for a minute.** Cache-aside working as
documented: the write path never touches the cache, so the stale copy stands until its TTL runs out,
and nothing errors because nothing failed. Delete the key in the same code path as the write, or
move that key to write-through.

**The database falls over at the same minute every hour.** An hourly import, warm-up script or
deploy wrote a batch of keys together with the same TTL, so they all expire, and stampede, at once.
Jitter the TTL where the value is written; a bigger database only changes the hour this starts
hurting.

**The lock is in place and the service fell over anyway.** Single-flight turns 48 database queries
into 48 requests waiting on one load. When that load takes ten seconds, you have traded a spike at
the database for a pile-up of held connections in your own process, which
[circuit breakers](./circuit-breakers.md) exist to stop. Bound the wait, and decide what a waiter
does when it hits the bound: take the stale value, or fail fast.

**Backoff went in and the herd came back anyway.** Exponential backoff with no randomness keeps
clients in step, because they all failed at the same moment: they wait one second together, then
two, then four. Marc Brooker's comparison shows the clusters surviving plain backoff and
disappearing once jitter is added, so it is both or neither.
