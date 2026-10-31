---
title: Primitives are immutable
question: Why does assigning to str[0] change nothing?
order: 2
practise:
  - js-autobox-assign
  - js-string-index-assign
  - js-dedupe
  - js-map-vs-object
sources:
  - author: MDN
    title: JavaScript data types and data structures
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures
  - author: MDN
    title: String
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String
  - author: MDN
    title: Strict mode
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode
  - author: MDN
    title: Map
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
verified: 2026-08-01
---

Text, numbers and true-or-false values in JavaScript cannot be changed once they exist. Anything
that looks like it edits a piece of text, such as upper-casing or trimming it, makes a new piece of
text and leaves the old one alone. Forget to keep the new one and nothing changes, often with no
error to tell you so.

## The model

Seven of the eight language types are primitive: string, number, bigint, boolean, symbol, undefined
and null. Object is the odd one out, and MDN draws the line in one sentence: "All types except Object
define immutable values represented directly at the lowest level of the language."

So there is no string sitting in memory with your name on it, waiting to be edited. `'ada'` is a
value in the same way `5` is a value. Asking to change the first letter of a string is like asking to
change the 5 in `5`, and the language has nowhere to put the request.

Then how does `'ada'.toUpperCase()` work, when a primitive has no properties? Autoboxing. MDN: "When a
property is accessed on a primitive value, JavaScript automatically wraps the value into the
corresponding wrapper object and accesses the property on the object instead." The wrapper is created
for that one access and discarded immediately afterwards.

Reading through a wrapper is useful. Writing through one is not, because you are setting a property
on an object that is about to be thrown away. Strict mode refuses to let the pretence stand: "in
sloppy mode, setting properties is ignored (no-op). In strict mode, a `TypeError` is thrown." Module
code and class bodies are always strict, so in most modern code it throws. A string's index
properties are a second dead end on their own: MDN says they "are neither writable nor
configurable".

Everything that looks like it edits a primitive returns a new one. `toUpperCase`, `trim`, `slice`,
`replace` and `padStart` all hand back a fresh string and leave the original alone. If you do not
keep the return value, nothing happened.

One consequence worth knowing: property keys are primitives too. A `Map`'s keys "can be any value
(including functions, objects, or any primitive)", but "the keys of an `Object` must be either a
`String` or a `Symbol`", so anything else used as a plain-object key is converted to a string first.
That is how an object used as a key becomes `"[object Object]"` and every one of them collides.

## Worked example

```js
const name = 'ada';

name[0] = 'A'; // sloppy mode: ignored. Strict mode: TypeError
name; // 'ada'

name.toUpperCase(); // 'ADA', created and immediately discarded
name; // 'ada'

const shouted = name.toUpperCase(); // keep it, or it never happened
const capitalised = name[0].toUpperCase() + name.slice(1); // 'Ada'
```

`name` is never edited in any of those lines. The last one builds a fourth string out of two others,
which is the only move available.

## Traps

**The uppercase never applied.** A line reading `value.trim();` or `value.toUpperCase();` on its own
does nothing you can see, because the new string it made was not assigned to anything. Every string
method is a producer, not an editor.

**The assignment that failed without failing.** `str[0] = 'X'` in a plain script or a console is
silently ignored, so the bug shows up much later as an unchanged value. The same line in a module
throws instead, and V8 words it as
`TypeError: Cannot assign to read only property '0' of string 'ada'`. Same non-event, two very
different reports.

**typeof says object.** `new String('x')` keeps the wrapper rather than discarding it, so `typeof` is
`'object'`, `new String('x') === 'x'` is false, and every wrapper object is truthy, which makes
`new Boolean(false)` truthy. Call `String(x)` and `Number(x)` without `new`: they convert and return
primitives.
