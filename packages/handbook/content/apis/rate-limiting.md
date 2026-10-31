---
title: Rate limiting
question: Which limiter do I reach for, and what do I count the requests against?
order: 4
practise:
  - http-rate-limit-window-expiry
  - rate-limit-express
  - http-429-backoff
  - security-rate-limit-auth
  - sys-rate-limiting-algorithms
sources:
  - author: Paul Tarjan
    title: Scaling your API with rate limiters
    url: https://stripe.com/blog/rate-limiters
  - author: Cloudflare
    title: How we built rate limiting capable of scaling to millions of domains
    url: https://blog.cloudflare.com/counting-things-a-lot-of-different-things/
  - author: IETF httpapi Working Group
    title: RateLimit header fields for HTTP
    url: https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/
  - author: MDN
    title: 429 Too Many Requests
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429
verified: 2026-08-01
---

A rate limiter caps how many requests one client can make in a stretch of time, so a single busy
script or attacker cannot use up the capacity everyone else needs. There are several ways to do
the counting, and they differ in how much bursting they allow. The choice that hurts people is what
you count against: get it wrong and a whole office shares one allowance, or a password-guessing
attack slips under every limit you set.

## The model

Five algorithms get used, and the useful way to hold them apart is what each one stores per client
and what that storage buys.

- **Fixed window** — a counter and an expiry. `INCR`, and `EXPIRE` when the counter is new. The
  cheapest thing that works and the easiest to reason about, at the cost of the boundary: a limit of
  5 a minute serves 10 requests in two seconds if they straddle the turn.
- **Sliding window log** — one timestamp per request, held for the length of the window. Exactly
  correct, because it counts what is actually inside the window. Its storage grows with the traffic
  you are trying to suppress, so the client hammering you hardest is the most expensive one to
  track.
- **Sliding window counter** — two counters, the current window and the previous one, with the
  previous weighted by how much of it still overlaps. Cloudflare published the numbers from 400
  million requests: 0.003% of requests wrongly allowed or limited, an average 6% difference from the
  real rate, and "only two numbers per counter". Approximate, and the approximation is measured.
- **Token bucket** — a token count and a last-refill timestamp. Tokens accrue at a fixed rate up to
  a cap, and a request spends one. The cap is a deliberate burst allowance, which is why it suits
  API traffic: a client that has been quiet is allowed to spend what it saved. Stripe's request rate
  limiter, the one that post calls "by far the most important", uses it.
- **Leaky bucket** — a queue, or a counter with a drain timestamp. Requests enter a bucket that
  drains at a constant rate, and an overfull bucket rejects. Its output rate is flat by
  construction, which is what you want in front of a fixed-capacity resource rather than in front of
  a fairness question.

Token bucket and leaky bucket are the pair worth being able to tell apart under questioning. Token
bucket tolerates bursts and smooths the average. Leaky bucket refuses to burst at all, and hands
whatever is behind it a steady rate.

The harder question is what you key on, because that decides who gets hurt.

Per IP is the cheapest and is wrong wherever a NAT, a corporate proxy or a mobile carrier puts
thousands of people behind one address, and it is free to evade with a pool of addresses. Per API
key or per user is correct for the thing you are usually protecting, which is fair use of your
capacity, but there is no user before login, which is exactly where the credential stuffing is. Per
endpoint is a second dimension rather than an alternative, because an export that runs for eight
seconds cannot share an allowance with a health check.

Real answers use several limiters with different keys. Stripe describes running four types in
production: a request rate limiter per user, a concurrency limiter for the expensive endpoints, and
two load shedders that reserve fleet and worker capacity for critical traffic when things are busy.
A login endpoint wants two at once, keyed on the account and on the IP, because they catch different
attacks: many passwords against one account is brute force, and one password against many accounts
is credential stuffing that never trips a per-account counter.

Then tell the client. `429 Too Many Requests` means the client sent too many requests in a given
amount of time, and `Retry-After` says how long to wait. Most APIs also advertise the budget on
every response with three ad-hoc fields, `RateLimit-Limit`, `RateLimit-Remaining` and
`RateLimit-Reset`, and the httpapi working group's draft is where that is being standardised: two
structured fields instead, `RateLimit-Policy` to describe the quota (`"burst";q=100;w=60`) and
`RateLimit` to report what is left (`"default";r=50;t=30`). Both take an optional `pk` partition
key, which is the wire format admitting that "what you keyed on" is something the client needs to
know. The draft's appendix is worth reading for why the `X-RateLimit-*` family never interoperated:
implementations disagree on whether reset is seconds, milliseconds or a UNIX timestamp.

## Worked example

A fixed window in Express, counted in Redis. Two lines carry the whole algorithm and one of them is
a trap:

```js
function createRateLimit(redis, { limit, windowSeconds }) {
  return async (req, res, next) => {
    const who = req.get('X-API-Key') ?? req.ip; // no key is still a client
    const key = `ratelimit:${who}`;

    const used = await redis.incr(key);
    // INCR creates a missing key with no deadline at all, so the first request
    // sets one. Calling EXPIRE every time moves the deadline forward forever
    // and a busy client is locked out permanently.
    if (used === 1) await redis.expire(key, windowSeconds);

    const reset = await redis.ttl(key);
    res.set('RateLimit-Limit', String(limit));
    res.set('RateLimit-Remaining', String(Math.max(0, limit - used)));
    res.set('RateLimit-Reset', String(reset));

    if (used > limit) {
      res.set('Retry-After', String(Math.max(1, reset)));
      return res.status(429).json({ error: 'Too many requests' });
    }

    next();
  };
}
```

The headers go on every response, not only on the refusals. A client that can see it has 3 of 100
left can slow down before it is turned away, which is the entire point of publishing them.

## Traps

**The limit is 5 a minute and the logs show 10 in three seconds.** A fixed window resets on a clock
edge, so a client that spends its allowance at the end of one window and again at the start of the
next gets double the limit across the boundary. Cloudflare's framing is that the counter "will be
arbitrarily reset at regular intervals, allowing regular traffic spikes to go through the rate
limiter". If that burst is the thing you are protecting against, the fixed window is the wrong
algorithm, not a badly tuned one.

**One client is limited forever.** The expiry was refreshed on every request instead of only when
the counter was created, so the deadline outran the traffic and the counter never expired. The
symptom is a single client stuck at `429` long after it went quiet, and it is invisible in testing
because a quiet key does eventually expire.

**An entire office is rate limited as one person.** Keyed on IP, and forty people share the
building's address. The same key is also nearly free to evade, so per-IP limits punish exactly the
users they should not and inconvenience nobody who is trying. Key on identity where you have one,
and treat IP as the fallback for the requests that arrive before login.

**Redis went down and took the API with it.** The limiter awaits a store that is not answering, and
every request now fails at the middleware. Fail-open and fail-closed are both defensible, they are
opposite decisions, and the wrong one is an outage. Decide it while writing the limiter, with a
timeout, rather than during the incident.

**429s, and the retries make it worse.** Clients that retry immediately turn a limit into a spike,
and clients that all retry on the same schedule synchronise into one. Obey `Retry-After` when it is
there, back off exponentially when it is not, and add jitter so the herd spreads out.
