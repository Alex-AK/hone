---
title: Memo, and what it cannot fix
question: I wrapped it in memo and nothing got faster. Why?
order: 5
practise:
  - react-memo-when
  - react-memo-inline-prop
  - react-usecallback-cost
  - react-derive-write-time
  - now-playing-react
sources:
  - author: React
    title: memo
    url: https://react.dev/reference/react/memo
  - author: React
    title: useMemo
    url: https://react.dev/reference/react/useMemo
  - author: React
    title: useCallback
    url: https://react.dev/reference/react/useCallback
  - author: React
    title: React Compiler
    url: https://react.dev/learn/react-compiler
  - author: MDN
    title: Object.is()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
  - author: Ryan Florence
    title: React, Inline Functions, and Performance
    url: https://reacttraining.com/blog/react-inline-functions-and-performance
verified: 2026-08-01
---

## The model

`memo`, `useMemo` and `useCallback` make the same trade: run a comparison, and skip some work when
the comparison says nothing changed. The comparison runs on every render, including all the renders
where nothing gets skipped. That is the bill you always pay. The saving is the part that has to be
earned.

`memo` wraps a component and compares props. By default React compares each prop with `Object.is`,
and if every prop matches, it reuses the previous render's output instead of calling the component
at all. `Object.is(3, 3)` is true and `Object.is({}, {})` is false, so a prop built during the
parent's render is a new value every time. react.dev is blunt about what follows: "`memo` is
completely useless if the props passed to your component are always different, such as if you pass
an object or a plain function defined during rendering." One inline prop out of six is enough to
defeat it, nothing warns you which one, and the profiler shows the component rendering as often as
before with a prop comparison added on top.

`useMemo` caches a value between renders, keyed on a dependency array compared the same way.
`useCallback` is that hook with a function as the cached value. react.dev says the two forms,
`useCallback(fn, deps)` and `useMemo(() => fn, deps)`, are "completely equivalent", which tells you
what `useCallback` is for. A stable function reference only buys something when something downstream
compares references, meaning a `memo` child or a dependency array. A `<button>` does neither, so it
never notices.

Be careful about what a dependency array promises. It says when the cached value is definitely
stale. It does not promise the value survives when the dependencies are unchanged: React will not
discard a `useMemo` result "unless there is a specific reason to do that", and the reasons it lists
include editing the component's file in development, and the component suspending during its initial
mount in both development and production. `useMemo` is a performance hint. Code whose correctness
depends on one object existing exactly once wants a ref.

So there is an order to work in, and memoisation is last in it. Measure, then remove work (derive a
value at write time instead of on every keystroke, [move state down](./where-state-lives.md) so fewer
components render at all), then memoise what is left. [What a render actually
is](./what-a-render-is.md) is the measurement half: a component slow in its own render phase is not a
memo problem at all. Ryan Florence's account of adding `PureComponent` everywhere and
finding his app slower is the standard reason to keep that order.

## Worked example

`Row` is memoised and still renders on every render of `List`:

```jsx
const Row = memo(function Row({ item, onSelect }) {
  return <li onClick={() => onSelect(item.id)}>{item.name}</li>;
});

function List({ items }) {
  return (
    <ul>
      {items.map((item) => (
        <Row key={item.id} item={item} onSelect={(id) => setSelected(id)} />
      ))}
    </ul>
  );
}
```

`onSelect` is a new function object on each render of `List`. `memo` compares it with `Object.is`,
gets false, and renders `Row` anyway. Hoisting the handler into `useCallback` makes the comparison
pass, and it is worth doing only if `Row` is expensive enough that skipping it beats comparing two
props per row.

The other half of the job is not passing the comparison, it is deleting the work:

```jsx
function NoteSearch({ notes, query }) {
  const index = buildSearchIndex(notes); // 50,000 notes, rebuilt on every keystroke
  const results = index.search(query);
  return <ResultList results={results} />;
}
```

`useMemo(() => buildSearchIndex(notes), [notes])` stops the rebuild on the keystrokes that only
changed `query`, and that is the correct default. Building the index once where `notes` is written
or fetched is better again, because it takes the work off the render path for every client that ever
mounts this component, instead of caching it per client.

## Traps

**You wrapped the component in memo and the profiler shows it rendering exactly as often.** One prop
is an object, array or arrow function created during the parent's render, so `Object.is` reports a
change and `memo` skips nothing. The fix is every non-primitive prop, not the one you spotted: a
single `style={{ margin: 8 }}` left behind keeps the component rendering and keeps you paying for
the comparison.

**Every handler is wrapped in useCallback and nothing measurable changed.** A `<button>` is a host
element, and React re-renders it without ever comparing `onClick` to anything. Nothing downstream
reads the identity, so the `useCallback` is an allocation and a dependency comparison per render,
plus a dependency array somebody now has to keep correct. Reserve it for handlers going into a
`memo` child or a dependency array.

**A useMemo around trivial work, added to be safe.** `useMemo(() => a + b, [a, b])` stores a closure
and an array and compares that array on every render, to avoid an addition. It is a straight loss,
and `memo` is where the same instinct does real damage, because wrapping a cheap component makes
every render of it slower in exchange for skipping renders that were already cheap.

**Something broke when the memoisation was removed, or in development after a file edit.** Code was
relying on `useMemo` returning the same object every time: an identity used as a cache key, a
subscription, an instance meant to be created once. React reserves the right to throw that value
away. Anything that has to exist exactly once belongs in a ref or in state, where the guarantee is
real.

## What the compiler changes

React Compiler does this memoisation at build time, and react.dev now describes it as stable and in
production at Meta. Where it runs, hand-written `memo`, `useMemo` and `useCallback` are mostly
redundant, and the docs keep the two hooks as escape hatches for the cases where you need control
over exactly what gets memoised. The mechanism is still worth knowing, because most React code you
will read was written before the compiler, and every one of these calls in it was somebody's
judgment call. Some of them were wrong, and they look identical to the ones that were right.
