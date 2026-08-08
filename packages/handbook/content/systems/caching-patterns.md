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

## The model

The named patterns are five answers to one question: who writes to the cache, and when. Choose the
answer and the staleness, the cost and the failure mode all follow from it.

- **Cache-aside (lazy loading)** — the application writes, on a miss. A read checks the cache, and a
  miss reads the database and puts the value back. Writes go straight to the database and leave the
  cache alone, so the cached copy is wrong from the write until the TTL runs out. AWS's summary of
  the trade is the honest one: only data somebody asked for is ever cached, and an empty node is
  survivable, at the price of a miss costing three trips (the lookup, the query, the write back) and
  of stale reads in between. This is the default for read-heavy data, and it is
  `sys-cache-aside-vs-write-through`.
- **Read-through** — the cache writes, on a miss. The read path looks the same from outside. The
  difference is that the loading code lives behind the cache's `get` instead of in every caller, so
  there is one implementation of the miss path rather than one per call site. Staleness behaves
  exactly as it does in cache-aside.
- **Write-through** — the write path writes, synchronously. Every write updates the cache and the
  database together, so a read after a write finds the current value and the stale window closes.
  It costs two trips on every write and it fills the cache with entries nobody reads, which is why
  it is normally paired with a TTL rather than used on its own.
- **Write-behind (write-back)** — the write path writes, asynchronously. The write lands in the
  cache, the caller is answered, and the database is updated later, often in a batch. The fastest
  writes here, and the only pattern where the cache is briefly the only copy: lose the node before
  the flush and you have lost writes you already acknowledged.
- **Refresh-ahead** — a background reload writes, before expiry. The cache refreshes an entry that
  is being read as its TTL approaches, so a popular key never has a moment of not existing. It pays
  off where you can predict what gets asked for, and spends a load on every key it guesses wrong
  about.

Which layer any of this sits at is [the layers](../caching/the-layers.md). The three questions every
cache asks whatever the pattern, what the key is, when the value stops being true, and whether stale
beats slow, are [the hard parts](../caching/the-hard-parts.md).

Then the half that decides whether the cache helped or hurt: the miss.

A cache in front of a database does one specific job, which is turning many requests a second into
one query per TTL. The moment the key is gone that stops being true, and it stops being true when
load is highest, because a key is only hot if many readers arrive inside the time one load takes.
Fifty concurrent readers, one expired key, fifty identical queries at the database. That is a **cache
stampede**, also called dog-piling, and it is `sys-cache-stampede`.

Three fixes, solving different halves of it:

1. **One caller recomputes and the rest wait.** A lock, or single-flight. In Redis that is
   `SET lock:<key> <token> NX EX <seconds>`: `NX` sets the key only if it does not already exist, so
   exactly one caller is answered `OK`, and the expiry releases the lock if that caller dies holding
   it. nginx ships the same idea as `proxy_cache_lock`, where "only one request at a time will be
   allowed to populate a new cache element" and the rest wait for the response or the lock. The
   database sees one query. The waiters still wait, and that is the cost.
2. **Jittered TTLs.** Keys written in the same second expire in the same second. Writing
   `ttl = base + random(spread)` spreads those expiries over a window, so the misses arrive as a
   trickle instead of a spike. It is the cheapest of the three and the only one that prevents the
   synchronised case rather than surviving it. It does nothing for a single genuinely hot key, which
   has one expiry moment however you jitter it.
3. **Serve stale while revalidating.** Keep the expired value and refresh behind it, so one caller
   pays and nobody waits. RFC 5861 says a cache "MAY serve the response in which it appears after it
   becomes stale, up to the indicated number of seconds", which is
   [revalidation](../caching/revalidation.md) at the HTTP layer, and nginx spells the same behaviour
   `proxy_cache_use_stale updating`. It needs a product decision rather than an engineering one:
   an answer a few hundred milliseconds out of date has to be acceptable.

**A stampede and a thundering herd get called by each other's names, and their fixes are not
interchangeable.** A stampede is many readers and one key, synchronised by a TTL, and every fix above
is a change to how that key is written or read. A thundering herd is many clients and one moment: a
service comes back after 30 seconds down, and 10,000 clients that had each been retrying every 5
seconds arrive in the same second, which is `sys-thundering-herd`. No cache fix touches that, because
no cache is involved. The fix is on the caller, and it is exponential backoff so the retry pressure
thins out plus jitter so the callers stop agreeing on when to try. What the two failures share is the
shape, independent actors accidentally in lockstep, which is why jitter is an answer to both. Backoff
and jitter as a retry policy is [failure and retries](../server-runtime/failure-and-retries.md).

## Worked example

One hot key expiring, under three policies. The load takes 400ms and traffic is 120 requests a
second, so 48 requests arrive while the first one is still loading.

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

The third policy is the only one where nothing waits, and the only one that answers 48 requests with
a value that is up to 400ms out of date. The prevention is one line at the point of writing:

```js
// Keys written in the same second must not expire in the same second.
await redis.set(key, value, { EX: 300 + Math.floor(Math.random() * 60) });
```

## Traps

**A write went in and readers kept seeing the old value for a minute.** Cache-aside behaving as
documented: the write path never touches the cache, so the stale copy stands until its TTL runs out,
and nothing reports an error because nothing failed. Delete the key in the same code path as the
write, or move that key to write-through and accept paying a cache write for data nobody may read.

**The database falls over at the same minute every hour.** An hourly import, a warm-up script or a
deploy wrote a batch of keys together, so they were all given the same TTL at the same instant and
they all expire at the same instant. Every one of them stampedes at once. Jitter the TTL where the
value is written; a bigger database only changes the hour at which this starts hurting.

**The lock is in place and the service fell over anyway.** Single-flight converts 48 database queries
into 48 requests waiting on one load. When that load takes ten seconds, you have traded a spike at
the database for a pile-up of held connections inside your own process, which is the failure
[circuit breakers](./circuit-breakers.md) exist to stop. Bound the wait, and decide in advance what a
waiter does when the bound is hit: take the stale value, or fail fast.

**Backoff went in and the herd came back anyway.** Exponential backoff with no randomness keeps
clients in step, because they all failed at the same moment: they wait one second together, then two,
then four. Growing the delay thins the traffic over time, and the randomness is what stops it
arriving in clumps. Marc Brooker's comparison of the two shows the clusters surviving plain backoff
and disappearing once jitter is added, so it is both or neither.
