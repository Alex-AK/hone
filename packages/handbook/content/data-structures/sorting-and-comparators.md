---
title: Sorting, and the comparator that lies
question: The list is sorted, and it is in the wrong order. What is my comparator actually returning?
order: 4
practise:
  - js-sort-numbers
  - debug-array-sort-comparator
  - js-sort-mutates
  - code-sort-by-multiple
  - http-cursor-tiebreaker
  - records-sorting-drizzle
sources:
  - author: MDN
    title: Array.prototype.sort()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
  - author: MDN
    title: Array.prototype.toSorted()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/toSorted
  - author: TC39
    title: 'ECMAScript: Array.prototype.sort ( comparator )'
    url: https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.sort
verified: 2026-08-02
---

To sort a list by anything other than the default order, you hand the sort a small function that
compares two items and says which goes first. The sort trusts that answer completely. Get it subtly
wrong and nothing errors: the list comes back looking sorted, in the wrong order, and the bug
survives review.

## The model

With no comparator, `sort` never compares your values. MDN: "The default sort order is ascending,
built upon converting the elements into strings, then comparing their sequences of UTF-16 code unit
values." `"10"` sorts before `"9"` on its first character, and that is documented behaviour:

```js
[10, 9, 1].sort(); // [1, 10, 9]
```

A comparator is a contract: it answers one question about one pair, with a sign: negative puts `a`
before `b`, positive puts `b` before `a`, and **zero means treat them as equal**. Only the sign
counts, never the size. So a comparator returning a boolean can never say "before", because `true`
and `false` coerce to 1 and 0, and the sort only ever hears "b first" or "already equal". On Node 24
(V8), `[3, 1, 2].sort((a, b) => a > b)` hands back `[3, 1, 2]`, untouched.

Nothing better is promised. A consistent comparator, in the spec's terms, returns the same non-`NaN`
number for a given pair and is reflexive, symmetric ("If a =C b, then b =C a") and transitive, and
`a > b` fails symmetry: `cmp(1, 3)` reads as `0` while `cmp(3, 1)` reads as `1`. "The sort order is
implementation-defined if sortCompare is not a consistent comparator for the elements of items."

Keep the contract and stability comes with it: "Since version 10 (or ECMAScript 2019), the
specification dictates that `Array.prototype.sort` is stable", granted only where the order is not
implementation-defined. That is what makes a two-pass sort work, secondary key first, primary second.

`sort` mutates: it sorts in place and returns "the reference to the same array", so assigning the
result to a new name copies nothing. `toSorted` is "the copying version of the `sort()` method".
Sorting costs more than a scan as `n` grows ([what O notation is for](./what-o-notation-is-for.md)),
[choosing a structure](./choosing-a-structure.md) covers holding data in order instead, and
[the key function](./the-key-function.md) covers deriving the value you sort by.

The contract reaches past JavaScript. A sort key that is not unique leaves tied rows in no fixed
order, so a page boundary can land mid-tie. The tiebreaker has to be unique, and it has to be in the
`ORDER BY`, the cursor and the index at once.

## Worked example

```js
const rows = [
  { name: 'Cy', team: 'infra', tickets: 40 },
  { name: 'Ada', team: 'core', tickets: 9 },
  { name: 'Bo', team: 'core', tickets: 200 },
];

[...rows].sort((a, b) => a.tickets > b.tickets).map((r) => r.name); // ['Cy', 'Ada', 'Bo']  ← untouched
[...rows].sort((a, b) => b.tickets - a.tickets).map((r) => r.name); // ['Bo', 'Cy', 'Ada']
```

Two keys in one pass: return the first non-zero comparison, which `||` does because `0` is falsy.

```js
[...rows]
  .sort((a, b) => a.team.localeCompare(b.team) || b.tickets - a.tickets)
  .map((r) => `${r.team}/${r.name}`); // ['core/Bo', 'core/Ada', 'infra/Cy']

rows.toSorted((a, b) => b.tickets - a.tickets) === rows; // false, a new array
rows.sort((a, b) => b.tickets - a.tickets) === rows; // true, and rows is reordered in place
```

## Traps

**The list is sorted and 10 comes before 9.** No comparator was passed, so every element went through
`String()` first. Pass `(a, b) => a - b`, or `(a, b) => a.getTime() - b.getTime()` for dates.

**The comparator runs and the order never changes.** It returns a boolean, and `false` is `0`, which
the sort reads as "equal". Return a number: subtract, or `localeCompare` for strings.

**Sorting the table reordered a list somewhere else.** `sort` edits the array it was given and returns
that same array, so sorting props or state mutates the caller's data. Sort a copy with `toSorted`.

**Page two repeats a row from page one.** The cursor pages on a column that ties, so `<=` hands back
rows you have already shown, while `<` skips the rest of the tie and a row appears on no page at all.
Put the primary key in the `ORDER BY`, the cursor and the index.
