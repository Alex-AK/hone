---
title: The hard parts
question: The cache works. What breaks next, and why is it always the same three things?
order: 5
practise:
  - code-memoize
  - code-lru-cache
  - code-once
  - js-map-vs-object
  - dom-localstorage-json
  - rate-limit-express
  - stock-lookup-express
sources:
  - author: MDN
    title: HTTP caching
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching
  - author: MDN
    title: Cache-Control
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
  - author: IETF
    title: 'RFC 5861: HTTP Cache-Control Extensions for Stale Content'
    url: https://www.rfc-editor.org/rfc/rfc5861.html
  - author: MDN
    title: 'Window: localStorage property'
    url: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
verified: 2026-08-01
---

## The model

Every cache, at every layer, asks the same three questions. The layer changes the vocabulary and
nothing else.

**What is the key?** It has to name everything the value depends on and nothing else. Miss a
dependency and you hand one user another user's value. Include something irrelevant, like a request
id or a timestamp, and you have built a cache that never hits. In JavaScript this lands on how you
build the key: `JSON.stringify(args)` is the usual memoise key and it is sensitive to property
order, so `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` are two entries for one answer. That is
`code-memoize`. Keying by object identity in a `Map` sidesteps stringifying altogether, at the price
of only ever matching the same object, which is `js-map-vs-object`.

**When does it stop being true?** Two answers, and you almost always ship both. A TTL says "wrong
for at most N seconds" and needs no knowledge of what changed. Event-driven invalidation says
"wrong for milliseconds" and requires whoever writes to know every key derived from what they wrote.
That list is the hard part. It is not written down anywhere, it grows every time somebody adds a
feature, and nothing fails loudly when it falls out of date. A short TTL underneath explicit
invalidation turns a missed entry from a permanent bug into a bounded one.

**Is stale worse than slow?** A product question in engineering clothes. A stock count 30 seconds
behind is fine on a listing page and not at the checkout. Where stale is acceptable but the wait is
not, `stale-while-revalidate` says so in one header: serve the stored copy now, refresh behind it.
Where stale is not acceptable at all, you are not choosing a policy, you are choosing not to cache.

**Two processes.** A `Map` in module scope is a cache whose lifetime is "until this process
restarts" and whose scope is "this process". Start a second instance and there are two of them,
disagreeing, with no way to invalidate the one you are not in. Deploys hide it, because a restart
clears both. The moment a value has to be the same for everyone, the cache moves out of the process
into Redis or memcached, and the failure modes change with it: a network hop, serialisation, and a
TTL that now expires for every reader at the same instant. `rate-limit-express` is this decision
made for a counter rather than a cache, which is why the count lives in Redis and not in a `Map`.

**The stampede.** A popular key expires. The next thousand requests all miss, all compute the same
value, and all write it back. The cache was the thing protecting the database, and it stops being
that at the exact moment the load is highest. Three fixes, used together: one caller recomputes
while the rest wait on it, refresh before expiry rather than after, and jitter the TTLs so keys
written together do not expire together. At the HTTP layer a shared cache gives you the first one
free, which MDN calls request collapse.

## Worked example

The memoise everyone writes, which has four separate problems:

```js
const cache = new Map();

export async function getPricing(planId) {
  if (!cache.has(planId)) {
    cache.set(planId, await loadPricing(planId));
  }
  return cache.get(planId);
}
```

It never expires, so a price change needs a deploy. It never evicts, so one entry accumulates per id
anyone asks about, including ids that do not exist. It is per process. And it stampedes: the `await`
finishes before anything is stored, so ten concurrent callers all miss and all call `loadPricing`.

Storing the promise instead of the value fixes the last one, and a timestamp fixes the first:

```js
const cache = new Map(); // planId -> { at, value: Promise }
const TTL_MS = 60_000;

export function getPricing(planId) {
  const hit = cache.get(planId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  // The promise goes in, not the result: concurrent callers share one load.
  const value = loadPricing(planId).catch((error) => {
    cache.delete(planId); // a failure must not be cached for a minute
    throw error;
  });

  cache.set(planId, { at: Date.now(), value });
  return value;
}
```

Four lines longer, two problems left. Bounding the size is `code-lru-cache`, and being correct
across two processes is not something this file can do at all. The one-key version of the same
promise trick is `code-once`: run it on the first call, hand everyone afterwards the first result.

## Traps

**The deploy went out and half the users still have the old bundle.** The asset was fine: hashed
name, `immutable`, correct. The HTML that names it went out with an hour of freshness on it, so half
your users are holding a document that points at last week's JavaScript. This is the invalidation
problem in one sentence: you can invalidate the thing you changed, and you cannot invalidate the
things that referred to it. The fix is upstream of the cache. Never let the document that names the
versioned asset be cached longer than you can tolerate being one version behind.

**It worked in staging, where there is one instance.** A value updates for some users and not
others, and which ones changes on every refresh. Two processes, two in-memory caches, one of which
has been invalidated. Nothing here is timing-dependent enough to reproduce locally, which is why the
ticket sits open for a week.

**Memory climbs until the container is killed.** An unbounded memo table is a memory leak with a
respectable name. Every distinct argument is retained forever, and user-supplied arguments make that
unbounded by definition. Give it a capacity and an eviction rule, which is `code-lru-cache`, or a
sweep that actually runs.

**The cache went cold and took the database with it.** A Redis restart, a key prefix changed by a
deploy, or a batch of TTLs written in the same second all produce the same event: every request is
a miss at once. Look at what the origin does with zero cache in front of it before you need to know,
because that is the number that decides whether a cold cache is an incident.

**A user reports data from three weeks ago and no reload fixes it.** Something was cached in
`localStorage`, which MDN describes as having no expiration time and surviving browser sessions.
There is no TTL, no eviction, no invalidation and no size management unless you write all four, and
it stores strings only, so everything goes through `JSON.stringify` on the way in and out
(`dom-localstorage-json`). Every script running on the page can read it too, which is the reason a
session token does not belong there.
