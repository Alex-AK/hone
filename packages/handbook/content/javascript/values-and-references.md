---
title: Values and references
question: Why did editing my copy of an object edit the original as well?
order: 1
practise:
  - js-shallow-copy
  - debug-spreadsheet-copy
  - debug-array-fill-objects
  - js-deep-clone
  - debug-clone-methods-compare
  - code-deep-equal
sources:
  - author: MDN
    title: JavaScript data types and data structures
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures
  - author: MDN
    title: Object.assign()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
  - author: MDN
    title: structuredClone()
    url: https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone
verified: 2026-08-01
---

Putting an object into a second variable does not make a second object. Both names lead to the same
thing, so a change made through one shows up through the other, and handing an object to a function
hands over the original. A real copy takes a deliberate step, and the usual shorthand for copying
only goes one level deep.

## The model

A variable holds a value. When the value is a number or a string, the value is the thing itself. When
it is an object, the value is a reference: an address, pointing at something that lives somewhere
else. The object is never in the variable.

Assignment copies whatever is in the variable, and for an object that is the address. You end up with
two variables and still one object:

```js
const a = { total: 1 };
const b = a;
b.total = 2;
a.total; // 2
```

Passing an argument is the same operation with a different name, so a function that changes its
parameter's properties is changing the caller's object. And `===` follows the rule too: for objects it
asks whether two references point at the same thing, never whether two objects look alike. That is
why `{ id: 1 } === { id: 1 }` is false.

Copying for real means choosing how deep to go. Spread and `Object.assign` copy the top level only,
and MDN says what happens to the rest: "If the source value is a reference to an object, it only
copies the reference value." `structuredClone` copies the whole graph, including circular references,
and throws a `DataCloneError` on anything it cannot handle, such as a function or a DOM node.

## Worked example

A shallow copy, and the exact line where it stops being a copy:

```js
const original = { name: 'Ada', prefs: { theme: 'dark' } };
const copy = { ...original };

copy.name = 'Grace'; // a new own property on copy
copy.prefs.theme = 'light'; // the object both of them point at

original.name; // 'Ada'
original.prefs.theme; // 'light'  ← never copied
copy.prefs === original.prefs; // true
```

One level down, the spread handed over an address instead of duplicating anything. A deep clone does
not:

```js
const clone = structuredClone(original);

clone.prefs.theme = 'dark';
original.prefs.theme; // 'light'
clone.prefs === original.prefs; // false
```

## Traps

**You copied it, and the original changed anyway.** The copy was shallow, so every nested object is
still shared. Spread, `Object.assign` and `slice` all stop after one level. Either copy the level you
are about to change (`{ ...view, prefs: { ...view.prefs, theme } }`) or use `structuredClone` and stop
thinking about depth.

**Three rows that change together.** `new Array(3).fill({ value: 0 })` evaluates its argument once and
writes that one reference into every slot, so editing row 0 edits rows 1 and 2. Build it with
`Array.from({ length: 3 }, () => ({ value: 0 }))` instead, which runs the factory per slot and gives
you three separate objects.

**Two identical objects that are not equal.** `{ id: 1 } === { id: 1 }` is false, and so is
`ids.includes(user)` when `user` was rebuilt from the same JSON. Nothing in the language compares
object contents for you: compare a field, key by an id, or write the structural comparison yourself.

**A helper reordered the caller's array.** Handing an array to a function hands over the reference,
and `sort`, `reverse`, `splice` and `push` all edit in place. The mutation is real work happening to
somebody else's object, which is what the [mutation](./mutation.md) page is about.
