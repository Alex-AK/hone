# Cache the stock lookup

`GET /availability?branch=leeds&sku=DRILL-03` answers one question: how many of this item are on the
shelf at this branch. Every ask adds it up from that branch's stock movements, the product page asks
once per item it lists, and it is now the slowest thing the service does. Put a cache in front of
it.

## The task

Both handlers are in `src/server/availability.ts`. `app.ts` has wired them up already.

**A lookup that has just been made is answered from Redis.** Counting is the thing you are avoiding,
so a repeat of the same lookup must not reach `countUnits` at all.

**A lookup that differs gets its own answer.** `leeds`/`DRILL-03` and `hull`/`DRILL-03` are two
questions, and neither branch is ever served the other one's number.

**A delivery makes the next lookup see it.** `POST /deliveries` records units arriving at one branch,
and the lookup for that branch and that item has to come back with them. Every other lookup keeps
what it had.

**Everything you store carries a deadline**, `options.ttlSeconds` long. Stock moves in ways this
service never hears about, so an entry that nothing clears still has to stop being served.

What the endpoint answers with does not change: `{ branch, sku, units }` on a 200, and a 400 when
either parameter is missing.

## Notes

`src/server/stock.ts` is the data behind the lookup, and it is read-only:

- `countUnits(branch, sku)` adds up every movement for that branch and that item. Here that is a walk
  over an array; in production it is an aggregate across the movements table.
- `recordDelivery(branch, sku, units)` puts stock on the shelf.
- `counts` is how many times `countUnits` has run. No real service has this; a checkpoint reads it.

`src/server/fake-redis.ts` is enough of Redis to write real Redis code against, with the semantics
the real commands have: `get`, `set`, `del`, `ttl`, `keys`, `flushAll`. Three are worth reading
before you rely on them.

- `set(key, value, ttlSeconds?)` with no `ttlSeconds` stores the value **with no deadline at all**,
  and clears any deadline the key was already carrying. That is what real `SET` does.
- `del` takes one key or several and answers with how many of them were there to remove.
- `ttl` answers `-1` for a key with no deadline and `-2` when there is no key.

It also has an `advanceTime(seconds)` that real Redis does not, which is how the checkpoints wait out
a deadline without waiting.

The cache is Redis rather than a `Map` because two instances of this service run behind the load
balancer, and a delivery that lands on one of them has to be true on the other.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- The stored answer is a string you parse only to serialise again on the way out. Work out what
  sending it back untouched would save, and what it would cost you the first time the shape changes.
- The same parameter can arrive twice: `?branch=leeds&branch=hull`. Find out what Express hands the
  handler, and what your key would do with it.
- Nothing here stores a miss. Decide whether a lookup for a branch nobody has ever heard of should
  get an entry of its own, and what it costs you either way.
