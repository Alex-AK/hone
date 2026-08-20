---
title: Effects, and what cleanup has to undo
question: Do I need an effect here, and what does its cleanup have to undo?
order: 3
practise:
  - react-effect-cleanup
  - debug-event-listener-leak
  - react-effect-object-dep
  - react-stale-closure
  - react-fetch-race
  - react-abort-on-unmount
  - react-effect-vs-handler
  - react-read-timer-hook
  - autocomplete-react
sources:
  - author: React
    title: Synchronizing with Effects
    url: https://react.dev/learn/synchronizing-with-effects
  - author: React
    title: You Might Not Need an Effect
    url: https://react.dev/learn/you-might-not-need-an-effect
  - author: React
    title: useEffect
    url: https://react.dev/reference/react/useEffect
  - author: React
    title: StrictMode
    url: https://react.dev/reference/react/StrictMode
  - author: MDN
    title: AbortController
    url: https://developer.mozilla.org/en-US/docs/Web/API/AbortController
verified: 2026-08-01
---

## The model

An effect synchronises your component with something outside React: a subscription, a timer, a socket,
the browser DOM, a request whose answer belongs on screen. React's own docs call effects "an escape
hatch from the React paradigm". Most effects people write are not that, so there are two questions,
and they come in this order.

**Does this need an effect at all?** Two things look like effects and are not. Transforming data for
render is an expression in the component body: filter it, sort it, total it during render and it
cannot be out of date. Reacting to something the user did belongs in the event handler, because the
handler knows what happened and an effect only sees the state that came out of it. Deciding a value
is derived rather than stored is the same question [where state lives](./where-state-lives.md) asks
first.

**What does the cleanup have to undo?** Whatever the effect started. The test is that running setup
twice in a row leaves the world in the same state as running it once: two `addEventListener` calls
and one listener attached, two timers and one pending, two requests started and one that can still
land. Cleanup is not an unmount hook. React runs it before every re-run, with the old values, and
again when the component is removed.

Dependencies are the values the effect reads. React compares each one against its previous value with
`Object.is`, which for an object, an array or a function means reference equality. A literal written
in the component body is a new reference on every render, so the dependency always looks changed, the
effect runs, sets state, renders, and builds another new reference.

In development, Strict Mode mounts, unmounts and remounts every component once, so each effect runs
setup, cleanup, setup. Doubled listeners under Strict Mode are the cleanup being wrong, not Strict
Mode being wrong; the same doubling arrives in production the first time a dependency changes.

## Worked example

The search effect from the [autocomplete-react](/workouts/autocomplete-react) workout. One effect,
two things to undo:

```jsx
useEffect(() => {
  const term = query.trim();
  if (!term) {
    setResults([]);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    searchProducts(term, { signal: controller.signal })
      .then(setResults)
      .catch((error) => {
        if (error.name !== 'AbortError') setFailed(true);
      });
  }, debounceMs);

  return () => {
    clearTimeout(timer);
    controller.abort();
  };
}, [query, debounceMs]);
```

Every keystroke changes `query`, so React cleans up and re-runs. `clearTimeout` makes a keystroke
inside the debounce window replace the pending search rather than add a second one. The abort handles
the requests that did get sent: the last one to start is not the last to land, and a slow answer for
`ab` arriving after a fast answer for `abc` is how results flick backwards. Aborting means the
superseded request cannot come back at all.

An abort rejects the promise with an `AbortError`, which is the effect doing exactly what it was told,
so it never reaches the user. Only a real failure sets `failed`.

The dependencies are `[query, debounceMs]` because those are the two values the effect reads.
`debounceMs` is a number, which is why it is safe there. Had the component taken
`options={{ debounceMs: 300 }}`, the parent would build a new object on every one of its renders and
the box would restart its search forever.

## Traps

**The network tab never stops, and the effect fires on a loop.** A dependency is an object, array or
function created during render, so `Object.is` sees a new value every time. Hoist it out of the
component if it never changes, depend on the primitive fields inside it, or wrap it in `useMemo` or
`useCallback` when it genuinely derives from props.

**The interval logs `0` forever while the counter climbs.** The callback closed over the `count` from
the render that created it, and `[]` means the effect never re-runs, so no fresher closure is ever
installed. This is the dependency rule seen from the other side: the array decides which renders get
an effect that can see their values. Add `count`, use the functional updater, or keep the latest value
in a ref when you want the interval itself to stay stable.

**Two subscriptions in development, one in production.** Strict Mode ran setup, cleanup, setup, and
the cleanup did not undo the setup. That is a test passing information to you, not a bug in React.
Removing `<StrictMode>` hides a leak that ships.

**A React warning about updating state on an unmounted component.** The fetch outlived the component.
An `isMounted` flag silences the warning and still lets the request run to completion, holding the
connection open for an answer nobody will read. Return a cleanup that calls `controller.abort()`
instead, which cancels the work and settles the out-of-order race in the same line.
