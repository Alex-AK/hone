# Rate limit an endpoint with Redis

`POST /messages` is getting hammered by one client and everybody else is waiting behind it. Put a
limiter in front of it.

## The task

Implement `createRateLimit` in `src/server/rate-limit.ts`. It takes the Redis client and
`{ limit, windowSeconds }`, and returns Express middleware. `app.ts` has already wired it up.

**Fixed window.** A client gets `limit` requests per `windowSeconds`. The window opens on their first
request and runs for `windowSeconds` from there.

**Who the client is.** The `X-API-Key` header if there is one, otherwise the request's IP. A request
with no key is a client too, not an error.

**On the way through**, every response carries:

- `RateLimit-Limit` — the allowance
- `RateLimit-Remaining` — what is left of it, never below zero
- `RateLimit-Reset` — seconds until the window turns over

**Once the allowance is gone**, answer `429` with a `Retry-After` in whole seconds, and do not let the
request reach the handler.

## The last checkpoint

The first four run every test at five requests per sixty seconds. The last one generates the burst
and the limiter together: the allowance, the window, how many clients are spending, and where in the
window each request lands. Two things about those bursts are worth knowing. The limit and the window
are drawn per burst, so a limiter that has those two numbers written into it rather than read from
its options is the one thing they catch that nothing else can. And `Retry-After` is obeyed rather
than inspected: whatever a refusal says to wait, a client comes back after exactly that and is
expected in, and comes back a second earlier and is expected to be turned away again.

It adds no rules. Everything it checks is on this page already. When it fails it leads with the rule
that broke and then prints the shortest burst that still breaks it, which is a complete reproduction:
that limit, that window, those requests and waits, in that order.

## Notes

`FakeRedis` is a real enough Redis for this: `incr`, `expire`, `ttl`, `get`, `set`, `del`, with the
semantics the real ones have. Two of them are worth reading before you rely on them.

- `incr` on a key that does not exist creates it at 1 **with no deadline**. Nothing expires by itself.
- `ttl` answers `-1` when a key has no deadline and `-2` when there is no key.

It also has an `advanceTime(seconds)` that real Redis does not, which is how the checkpoints wait out
a sixty-second window without taking sixty seconds.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- Two round trips per request is one more than you need. Work out what a Lua script or a pipeline
  would save, and whether it is worth the deploy complexity.
- A fixed window lets a client spend its whole allowance at the end of one window and again at the
  start of the next, so a limit of 5 a minute can serve 10 requests in two seconds. Sketch what a
  sliding window would cost to store.
- Decide what should happen when Redis is down. Letting everyone through and letting nobody through
  are both defensible, and the wrong one is an outage.
