---
title: Mutation
question: Is mutating this object the problem, or is the problem who else can see it?
order: 4
practise:
  - js-sort-mutates
  - react-state-object-mutation
  - debug-module-shared-instance
  - debug-mutable-shared-default
  - debug-object-default-param
  - debug-freeze-shallow
sources:
  - author: MDN
    title: Array.prototype.sort()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
  - author: MDN
    title: Object.freeze()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
  - author: MDN
    title: Object.assign()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
  - author: React
    title: useState
    url: https://react.dev/reference/react/useState
verified: 2026-08-01
---

Changing an object in place is fine until somebody else is holding the same object. Then your edit
turns up in their screen, their cache or another user's response, and code that spots changes by
asking whether it still has the same object sees nothing new at all. So whether an edit is safe
comes down to who else can see the thing you edited.

## The model

Mutation changes the object a reference points at. Reassignment points a variable at a different
value. `const` prevents the second and has nothing to say about the first, which is why
`const config = {}` followed by `config.debug = true` is legal.

"Is mutation bad" has no useful answer, because it leaves out the only thing that decides: who else
holds this reference. An object you built two lines ago and nobody has seen is yours to edit as much
as you like, and doing so is often the clearest code available. The same edit applied to an argument,
to props, to a module-level constant or to something in a cache is a change to what somebody else
reads.

The second half of the question is identity. Mutating keeps the reference intact, so anything that
decides "did this change?" by comparing references sees nothing at all. React is the everyday
example: it "will ignore your update if the next state is equal to the previous state, as determined
by an `Object.is` comparison", so mutating a state object and passing it back does nothing. Dependency
arrays, memoisation and change detection all read that same signal.

That gives you the working question. Does anyone else hold this reference, and does anything
downstream compare it by identity? If either is a yes, produce a new value rather than editing the
old one. The array methods come in pairs for exactly this reason: `sort`, `reverse` and `splice` edit
in place and hand back the same array, while `toSorted`, `toReversed`, `toSpliced` and `with` return a
new one.

## Worked example

A module-level default and a shallow copy, which is the version of this bug that reaches production:

```js
const DEFAULTS = { filters: [], page: 1 };

function createView(overrides) {
  return { ...DEFAULTS, ...overrides }; // shallow: filters is shared, not copied
}

const inbox = createView({});
const archive = createView({});

inbox.filters.push('unread');
archive.filters; // ['unread']
```

Every view that did not override `filters` holds the same array, for as long as the process lives. In
a browser tab that is a confusing bug; on a server it is one request's filters showing up in another
user's response. The fix is to stop sharing rather than to copy harder:

```js
const makeDefaults = () => ({ filters: [], page: 1 });

function createView(overrides) {
  return { ...makeDefaults(), ...overrides };
}
```

## Traps

**Two unrelated screens start showing each other's data.** A mutable value on a shared constant, and a
shallow copy that never duplicated it. Spread and `Object.assign` copy one level, so the nested array
is the same array everywhere. Build defaults in a factory instead.

**The state update ran and nothing re-rendered.** The object was mutated and then handed back, so
`Object.is` says the state is unchanged and React skips the render. Spread into a new object, at every
level you touch.

**`sort` reordered the list that came in as props.** MDN is explicit: `sort` "sorts the elements of an
array in place and returns the reference to the same array". You get a mutation and, because the
reference is unchanged, a UI that may not update. Copy first with `[...items].sort(…)` or call
`items.toSorted(…)`.

**You froze the object and it changed anyway.** `Object.freeze` is one level deep: it "only applies to
the immediate properties" and nested objects "are not frozen and may be the target of property
addition, removal or value re-assignment". The failed write is also silent in sloppy mode, so freezing
without strict mode hides the very error it was meant to surface.
