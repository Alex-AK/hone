---
title: Keys, and the function that makes them
question: My grouping is putting rows in the wrong bucket. What is wrong with my key?
order: 2
practise:
  - code-count-by
  - code-group-by-key
  - js-group-by
  - code-memoize
  - code-group-sort
  - sys-consistent-hashing
sources:
  - author: MDN
    title: JSON.stringify()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
  - author: TC39
    title: 'ECMAScript: OrdinaryOwnPropertyKeys'
    url: https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-ordinaryownpropertykeys
  - author: MDN
    title: Map
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
  - author: David Karger et al., MIT
    title: 'Consistent Hashing and Random Trees: Distributed Caching Protocols for Relieving Hot Spots on the World Wide Web'
    url: https://people.csail.mit.edu/karger/Papers/web.pdf
verified: 2026-08-02
---

Grouping rows, caching results and looking things up all work the same way underneath: turn each
value into a key, and things with the same key go together. The key is something you write, usually
without much thought. When it is wrong nothing throws. Rows land in the wrong bucket or a cache
stops hitting, and you find out from a report.

## The model

Every lookup, group-by and cache trades a scan for a [constant-time
answer](./what-o-notation-is-for.md), and the key function decides whether that answer is right.
[Choosing a structure](./choosing-a-structure.md) is the other half. A key function has three jobs,
and each one fails differently.

- **Total** — every input produces a key. The failure is a missing field: `item.userId` is
  `undefined` on some rows, so all of them land in one bucket named `undefined`, and nothing throws.
- **Deterministic** — the same input always produces the same key. The failure is one thing getting
  two keys, so a lookup that should hit misses and a cache quietly stops caching.
- **Injective enough** — things that should stay distinct never share a key. The failure is a bucket
  of rows that do not belong together, found in a report rather than a stack trace.

Derived keys are where it starts. `item.userId` groups by customer; grouping by customer and day
needs both, and the reflex is to join them into `` `${item.userId}|${item.date}` ``. That holds
until a part can contain the separator: `('a|b', 'c')` and `('a', 'b|c')` both produce `a|b|c`. So
`JSON.stringify([a, b])` is the honest key, and it has three limits, all real:

- **Property order is in the output.** The spec appends string keys "in ascending chronological
  order of property creation", so `{a, b}` and `{b, a}` are one object to you, two keys to a cache.
- **Some values vanish.** MDN: `undefined`, functions and symbols "are either omitted (when found in
  an object) or changed to null (when found in an array)".
- **Cycles throw** a `TypeError`, "Converting circular structure to JSON", from the key function.

Object identity is a different index, not a cheaper one. MDN, on `Map`: "for object keys, equality
is based on object identity. They are compared by reference, not by value." Key on the reference
when only that object can arrive, such as a DOM node; on an id when reparsed JSON can mean one row.

At scale the key function picks up one more job: surviving a change in the number of buckets.
`hash(key) % n` does not, because n is part of the address: over 1,000 keys, going from 4 servers to
5 moves 813 of them. [Consistent hashing](../systems/consistent-hashing.md) is Karger's fix, a hash
where "a small change in the bucket set does not induce a total remapping of items to buckets".

## Worked example

Three rows, two of them with a `|` in a name, keyed by team and project:

```js
const rows = [
  { team: 'platform', project: 'billing' },
  { team: 'platform|infra', project: 'billing' },
  { team: 'platform', project: 'infra|billing' },
];
new Set(rows.map((r) => `${r.team}|${r.project}`)).size; // 2 ← three pairs, two keys
new Set(rows.map((r) => JSON.stringify([r.team, r.project]))).size; // 3

const keyOf = (...args) => JSON.stringify(args);
keyOf({ userId: 'u1', day: '2026-08-02' }); // '[{"userId":"u1","day":"2026-08-02"}]'
keyOf({ day: '2026-08-02', userId: 'u1' }); // '[{"day":"2026-08-02","userId":"u1"}]'
keyOf(1, undefined) === keyOf(1, null); // true
keyOf({ id: 1, onDone: () => {} }); // '[{"id":1}]'
```

Rows two and three are different work by different teams; the join puts them in one bucket because
their key strings are identical, and the quoting keeps the tuple's boundary. Below it the same
function fails the other way. Ranking buckets is a [comparator's](./sorting-and-comparators.md) job.

## Traps

**Two teams' hours ended up in the same bucket.** The key joins two fields with a separator that one
of the values contains, so distinct pairs collide. Serialise the tuple with `JSON.stringify([a, b])`.

**The cache never hits, and the hit rate says 0%.** The key is `JSON.stringify` over an object built
in different property orders on different code paths. Build it from a fixed list of fields instead.

**One bucket is far bigger than the rest, and it is named `undefined`.** The key reads a field that
is absent on some rows, or misspelt against the API's casing. Drop those rows, or name them yourself.

**A memoized call returns a stale result after the arguments changed.** Something in the arguments
does not survive the key: a callback, an `undefined` that collides with `null`, a `Date` that
flattens. Pass a key function naming the fields that matter, which is what real memoizers take.
