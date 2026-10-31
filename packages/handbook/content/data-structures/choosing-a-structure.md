---
title: Choosing a structure
question: Array, object, Map or Set? What actually decides it?
order: 1
practise:
  - js-map-vs-object
  - js-dedupe
  - js-samevaluezero-includes
  - code-unique-by
  - code-lru-cache
  - js-object-entries
sources:
  - author: MDN
    title: Map
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
  - author: MDN
    title: Property accessors
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Property_accessors
  - author: TC39
    title: 'ECMAScript: OrdinaryOwnPropertyKeys'
    url: https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-ordinaryownpropertykeys
  - author: MDN
    title: Object.create()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create
verified: 2026-08-02
---

JavaScript gives you several ways to hold a collection, and most code picks one out of habit. They
differ in how you find something once it is in there, and in what you are allowed to look it up by.
Pick the wrong one and nothing throws: two different things quietly share a slot, a list reorders
itself, or a lookup finds an entry nobody put there.

## The model

An array knows positions, not contents, so `includes`, `indexOf` and `find` walk it from the start
until something matches. A `Set`, a `Map` and a plain object take a key and go straight to the entry.
Which of those costs more, and when, is [what O notation is for](./what-o-notation-is-for.md).

Keys are where the four part company. MDN states the limit: "The keys of an `Object` must be either a
`String` or a `Symbol`." Anything else is coerced on the way in, and MDN says how far that goes: "Any
other value, including a number, is coerced to a string."

```js
const counts = {};
counts[404] = 1;
Object.keys(counts); // ['404'], the number is a string now
counts[{ id: 1 }] = 'first';
counts[{ id: 2 }] = 'second';
Object.keys(counts); // ['404', '[object Object]'], both objects made one key
counts[{ id: 3 }]; // 'second', a third object reads the same slot
```

A DOM node collapses the same way with a better disguise: every `<div>` used as an object key becomes
`'[object HTMLDivElement]'`, so a lookup over ten rows holds one entry. A `Map` takes "any value (both
objects and primitive values)" and keys on the reference, so ten rows stay ten.

Membership runs on `SameValueZero`, in `Map` keys, `Set` members and `Array.prototype.includes` alike.
So `NaN` is findable in all three and never by `indexOf`, which uses `===`. None of them finds an
object you rebuilt: `new Set([{ id: 1 }]).has({ id: 1 })` is `false`.

Order splits the same way. A `Map` and a `Set` iterate in insertion order, always. A plain object puts
its integer-like keys first: the spec walks array-index keys "in ascending numeric index order", then
the rest "in ascending chronological order of property creation".

The last hazard is the plain object's alone. An empty `{}` already answers to `toString`, `constructor`
and the rest of `Object.prototype`, which is fine until the keys are user data. A `Map` starts
genuinely empty, and so does `Object.create(null)`, "an object with `null` as prototype".

So pick by the key, not by the shape. A reference, a number you want back as a number, or anything a
user typed means `Map`; "have I seen this" means `Set`; keys you wrote in the source, where spread and
`JSON.stringify` have to work, mean a plain object; and position being the meaning means an array.

## Worked example

```js
const byId = { 10: 'ten', 2: 'two', banana: 'fruit' };
Object.keys(byId); // ['2', '10', 'banana'], integers ascending, then insertion
byId['10']; // 'ten', and byId[10] reaches the same entry
const lookup = new Map().set(10, 'ten').set(2, 'two').set('banana', 'fruit');
[...lookup.keys()]; // [10, 2, 'banana'], insertion order, still numbers
lookup.get('10'); // undefined, while lookup.get(10) is 'ten': two separate keys
```

Three entries either way. The object renamed two keys and reordered them, and the `Map` did neither.

## Traps

**Your lookup has one entry, and it is whichever row rendered last.** The keys are DOM nodes and the
container is a plain object, so every node stringified to `'[object HTMLDivElement]'` and overwrote the
one before it. Key it with a `Map`, which holds the node reference itself.

**A word count came back with source code in it.** One of the words was `constructor`, so
`tally[word] ?? 0` found `Object.prototype.constructor` rather than nothing and `??` never fired,
leaving `'function Object() { [native code] }1'`. Tally on `Object.create(null)` or a `Map`.

**The list reordered itself when the ids became numbers.** Integer-like keys sort ascending on a plain
object however you inserted them, and the string ids did not, which is why it broke only now. Use a
`Map` to keep insertion order, or an array of entries and [a comparator](./sorting-and-comparators.md).

**The dedupe kept both copies.** `new Set(rows)` compares objects by reference, so two rows parsed from
the same JSON are two members. Put a primitive in the set instead of the object, and
[the key function](./the-key-function.md) is about choosing which primitive.
