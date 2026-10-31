---
title: What O notation is for
question: It was fast with 50 rows and it crawls with 5,000. How do I tell what happens at 50,000?
order: 3
practise:
  - react-slow-render
  - http-offset-cost
  - react-list-windowing
  - sys-back-of-envelope
  - react-derive-write-time
  - slow-list-endpoint-kysely
sources:
  - author: Pat Morin
    title: 'Open Data Structures: Mathematical Background'
    url: https://opendatastructures.org/ods-python/1_3_Mathematical_Background.html
  - author: MDN
    title: Array.prototype.find()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
  - author: V8
    title: 'Optimizing hash tables: hiding the hash code'
    url: https://v8.dev/blog/hash-code
verified: 2026-08-02
---

Code that is quick on a small test list can crawl on real data, because some work grows faster than
the data does. O notation is shorthand for how the cost of a piece of code grows as its input grows.
It says nothing about whether your page is fast right now: it tells you which work to worry about,
and measuring tells you whether to worry yet.

## The model

**It describes growth and discards everything else.** Pat Morin's Open Data Structures is precise
about the catch: a smaller big-Oh is "faster for large enough values of n", and where two are the
same "we won't know which is faster". So a worse complexity can win at the sizes you have, and a
better one can be a rewrite that buys nothing.

**The number that matters is the size you have and the size you are heading for.** Ask what `n` is
before arguing about the curve. An `n` of 40 and an `n` of 40,000 are different engineering problems
with the same code in front of them. Four shapes are worth recognising by sight:

- A nested loop over the same collection.
- A lookup inside a loop: `find`, `indexOf` or `includes` inside a `map` or `filter`. MDN's rule for
  `find` is that it "calls a provided `callbackFn` function once for each element in an array", so
  the array is rescanned every time and nothing at the call site reads as a loop.
- Work that repeats per render or per request instead of once.
- Work whose cost is set by what you fetched, not by what you returned. `LIMIT 20 OFFSET 100000`
  returns twenty rows and produces 100,020.

**The constant factor lives in allocation, copying, cache locality, and crossing a boundary.** A
boundary is a DOM write, a round trip, or a query, and one inside a loop settles the argument before
any complexity claim is made. So measure at the size you have, then reason about growth for the size
you are heading for: complexity tells you which curve, measurement tells you where on it you stand.

Which container to reach for is [choosing a structure](./choosing-a-structure.md), what makes a hash
lookup constant is [the key function](./the-key-function.md), and what a sort costs is
[sorting and comparators](./sorting-and-comparators.md).

## Worked example

The accidental quadratic and its fix, timed. N objects, N lookups by id.

```js
// Linear: find rescans the array on every lookup.
for (const id of queries) items.find((it) => it.id === id);

// Map: one pass to build, then a lookup that does not rescan.
const byId = new Map();
for (const it of items) byId.set(it.id, it);
for (const id of queries) byId.get(id);
```

Median of repeated passes, Node 24.16 on an arm64 Mac. One machine's numbers, here for the shape of
the curve rather than the absolute values.

| items  | `find` per pass | `Map` per pass |
| ------ | --------------- | -------------- |
| 100    | 0.031 ms        | 0.006 ms       |
| 1,000  | 0.47 ms         | 0.029 ms       |
| 10,000 | 51 ms           | 0.57 ms        |

The `Map` wins at every size, which is not the useful column. At 100 items the pass costs 31
microseconds and rewriting it is wasted work. At 10,000 it costs 51 milliseconds, three dropped
frames. Nothing about the code changed; only the absolute number grew enough to feel.

Data size is not the only variable. Hold it at 10,000 items and vary the lookups: the scan costs
0.015 ms for one, 0.33 ms for ten and 0.62 ms for twenty, while the `Map` costs 0.47 ms, 0.39 ms and
0.38 ms for the same three, because it pays for 10,000 `set` calls before answering anything. Below
about ten lookups the scan wins outright, and `node --jitless` moves that crossover lower still.

## Traps

**It was fine against the test fixture and it is nine seconds in production.** Something scales with
the row count and the fixture had fifty rows. Find the lookup in a loop, and measure at real size.

**We rewrote it to use a `Map` and it got slower.** Either there are not enough lookups to earn the
build cost back, or the `Map` is built inside the loop it was meant to speed up. V8 stores a hash
code per key rather than deriving one, so that build is real work: hoist it, or keep the scan.

**The endpoint still returns twenty rows and it has got slower every month.** Cost is set by what
the work touches, not by what it hands back. Ask how many rows were produced to yield those twenty.

**It is smooth on my laptop and stutters on a mid-range phone.** The complexity is identical on both
machines and the constant factor is not. Cut operations rather than their cost, and profile there.
