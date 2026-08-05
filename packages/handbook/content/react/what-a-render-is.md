---
title: What a render actually is
question: What actually happens between calling setState and the screen changing?
order: 1
practise:
  - react-slow-render
  - react-batching-scope
  - react-functional-update
  - react-state-object-mutation
  - invoice-panel-react
sources:
  - author: React
    title: Render and Commit
    url: https://react.dev/learn/render-and-commit
  - author: React
    title: Queueing a Series of State Updates
    url: https://react.dev/learn/queueing-a-series-of-state-updates
  - author: React
    title: useState
    url: https://react.dev/reference/react/useState
  - author: React
    title: Preserving and Resetting State
    url: https://react.dev/learn/preserving-and-resetting-state
  - author: React
    title: React v18.0
    url: https://react.dev/blog/2022/03/29/react-v18
verified: 2026-08-01
---

## The model

Calling a state setter does not touch the screen. It queues an update, and React later does three
separate things with it.

**Render** is React calling your component function. Your code runs, hands back JSX, and React
recurses into whatever that JSX contains. Nothing in the DOM moves. react.dev states it flatly:
"Rendering is React calling your components."

**Reconcile** is the comparison. React matches the new tree against the previous one by position and
works out which properties actually differ, and it does that while rendering, holding the result
until the next step. Position is also how state survives: the same component in the same position
keeps its state, while a different position or a different `key` is a different component, whose
state starts over.

**Commit** is the DOM write, applying only the differences reconcile found. If the output matches
last time, React does not touch the DOM at all. Then the browser paints, which is a separate step
again and none of it React's work. (react.dev counts three steps as trigger, render and commit, and
folds reconciliation into rendering. Splitting it out is worth it, because it is the part that
decides what commit does.)

So a wasted render is not a wasted DOM update. Your function ran, the `.filter().sort()` inside it
ran, React compared the output and wrote nothing. That whole cost sits in the render phase.

Updates queue rather than apply. A state variable is a `const` belonging to the render that read it,
so it never changes mid-handler: read it after calling the setter and you get the old value. React
works through the queue once the handler has finished and renders once for the lot. Since React 18
that batching applies everywhere, not only inside JSX event handlers: updates in promises,
`setTimeout` and native listeners batch too.

Some updates never get that far. If the next state is `Object.is`-equal to the current state, React
skips the re-render, though the docs note it may still call your component once before skipping its
children.

## Worked example

Two setter calls in one handler, and what each one puts in the queue:

```jsx
const [count, setCount] = useState(0);

function onClick() {
  setCount(count + 1); // count is 0, so this queues "set it to 1"
  setCount(count + 1); // count is still 0, so this queues "set it to 1"
  console.log(count); // 0
}
```

The handler returns, React applies the queue in order (set to 1, set to 1) and renders once. The
count is 1.

The updater form queues a function instead of a value, and each one receives the result of the one
before it:

```jsx
function onClick() {
  setCount((c) => c + 1); // queue: apply c + 1
  setCount((c) => c + 1); // apply c + 1 to the result of the first
}
```

The count is 2, in the same single render. Batching was never the bug here: both versions render
exactly once. What changed is what went into the queue.

## Traps

**You set state and nothing re-rendered.** The object you passed was the one already in state, with
a property changed on it: `user.tier = 'pro'; setUser(user)`. React compares next state to current
with `Object.is`, sees the same reference, and ignores the update. Replace rather than mutate
(`setUser({ ...user, tier: 'pro' })`), at every level you touch.

**The button adds one when it should add two.** `setCount(count + 1)` twice reads the same captured
`count` and queues the same value twice, so the second update overwrites the first. Whenever the
next state is derived from the previous state, pass the updater function instead of a number.

**You wrapped it in `memo` and it is still slow.** `memo` skips a render when props are unchanged,
so it can do nothing for a component whose `filter` prop changes on every keystroke. And when the
profiler puts the time inside that component's own render, skipping renders was never the lever:
fix the slow render before the re-render. A component that takes 40ms to render still takes 40ms
when it renders half as often. `useMemo` around the expensive filter and sort, or
[windowing](./long-lists.md) so the render only touches the rows on screen, is what moves that
number. [Memo, and what it cannot fix](./memo-and-what-it-cannot-fix.md) is the rest of that
argument.

**The DOM had not caught up by the next line.** Nothing is committed until the handler returns, so
measuring layout immediately after a state change reads the old DOM. `flushSync` is the escape
hatch: it renders and commits before it returns. It buys that at the price of a synchronous render,
which is why the docs call it a last resort rather than a way to make an update land sooner.
