---
title: Prototypes, and the object that is never empty
question: I wrote to a property and the object I expected to change did not. Where did the write go?
order: 6
practise:
  - debug-prototype-shadow
  - debug-this-callback
  - code-count-by
  - code-group-by-key
  - js-map-vs-object
sources:
  - author: MDN
    title: Inheritance and the prototype chain
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Inheritance_and_the_prototype_chain
  - author: MDN
    title: this
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this
  - author: MDN
    title: Object.create()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create
verified: 2026-08-02
---

Every JavaScript object has a hidden parent it falls back on when you ask it for something it does
not have itself. Reading follows that fallback and writing never does, so a change can land
somewhere other than where you meant it to. The same hidden parent is why an object you have only
just created, with nothing in it, already answers to names you never put there.

## The model

**A read walks the chain. A write does not.** Reading a property looks at the object, then its
prototype, then that object's prototype, until the chain hits `null`. Writing is one step: MDN puts
it plainly, "setting a property to an object creates an own property", with getters and setters as
the only exception. So the read and the write in `obj.count++` can address two different objects, and
the write always lands on the one in your hand.

That asymmetry has a name in the same document, **property shadowing**: the new own property does not
overwrite the inherited one, it hides it. The prototype still holds the old value, and every other
object inheriting from it still sees it.

**`this` is an argument, and the call site supplies it.** For an ordinary function `this` is whatever
the invocation gave it: the object before the dot for a method call, `undefined` in strict mode for a
bare call, and whatever `bind` or `call` pinned otherwise. Pulling a method out of an object throws
the receiver away, which is why a method passed as a callback stops working. Arrow functions are the
exception that makes it usable: they have no `this` of their own and close over the one in scope where
they were written.

**`{}` is not empty.** It inherits from `Object.prototype`, so `toString`, `valueOf`, `hasOwnProperty`
and `constructor` are all readable on it before you put anything in. An object used as a lookup table
is therefore pre-populated with keys you did not choose, and `__proto__` is worse than pre-populated:
assigning to it changes the prototype instead of storing a value.

## Worked example

Two objects, one prototype, and a counter that stops being shared:

```js
const defaults = { hits: 0 };
const session = Object.create(defaults);

session.hits++; // read walks up to defaults (0), write lands on session
session.hits; // 1
defaults.hits; // 0 — untouched
Object.hasOwn(session, 'hits'); // true — the write created this

const other = Object.create(defaults);
other.hits; // 0 — every session starts over
```

And the lookup table that is not empty:

```js
const counts = {};
counts['toString'] ?? 0; // the function, not 0 — so `?? 0` never fires

const safe = Object.create(null); // no prototype, no inherited anything
safe.toString; // undefined

const byId = new Map(); // keeps any key as itself, including 404 as a number
```

Every line above is output from running it, including the one people disbelieve: `counts['toString']`
is a function, so `(counts[key] ?? 0) + 1` concatenates onto `"function toString() { [native code] }"`.

## Traps

**The counter resets for every object, or the shared value never changes.** A prototype held the
initial value, the first `++` shadowed it, and now each object counts alone. If shared mutable state
is what you wanted, put it in a real container and mutate that; if per-object state is what you
wanted, initialise it as an own property in the constructor rather than leaning on the prototype.

**`this` is undefined inside a callback.** `emitter.on('x', logger.log)` passes the function without
the object, so the call site provides no receiver. `logger.log.bind(logger)`, an arrow wrapper, or an
arrow-function class field all fix it; the class field costs one function per instance rather than one
per class, which only matters when there are many instances.

**A key from user data behaves strangely.** `"toString"` reads back as a function, `"__proto__"`
silently changes the prototype rather than being stored, and a numeric id becomes the string `"404"`
because object keys always are strings. `Object.create(null)` removes the first two; a `Map` removes
all three and keeps insertion order, which makes it the right default whenever the keys come from
outside your code.
