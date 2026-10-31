---
title: The main thread
question: What is actually blocking the interface while this update runs?
order: 8
practise:
  - react-transition-not-for-input
  - react-transition-pending
  - react-slow-render
  - react-derive-write-time
sources:
  - author: MDN
    title: PerformanceLongTaskTiming
    url: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming
  - author: web.dev
    title: Interaction to Next Paint (INP)
    url: https://web.dev/articles/inp
  - author: web.dev
    title: Optimize long tasks
    url: https://web.dev/articles/optimize-long-tasks
  - author: React
    title: useTransition
    url: https://react.dev/reference/react/useTransition
  - author: React
    title: useDeferredValue
    url: https://react.dev/reference/react/useDeferredValue
  - author: MDN
    title: Scheduler.postTask()
    url: https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/postTask
  - author: MDN
    title: Scheduler.yield()
    url: https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield
  - author: MDN
    title: Using web workers
    url: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
verified: 2026-08-01
---

A browser tab runs your code, draws the page and handles every click and key press on the same
single line of work. While your code is busy, everything else waits its turn, so a slow update shows
up as a click that seems ignored or typing that trails behind. The fix is to do less, let input go
first, or move the work somewhere else.

## The model

One thread runs your JavaScript, and the same thread runs style, layout, paint and every event
handler. So "the render is slow", "the scroll janks" and "the input lags a keystroke behind" are one
fault reported from three seats: something is holding the thread and everything else is queued behind
it. Which queue a callback waits in, and why a job cannot be interrupted once it starts, is
[the event loop](../javascript/the-event-loop.md). This page is about the job doing the holding being
yours.

The unit is the task, and the threshold has a name. A long task, as the Long Tasks API defines it, is
"any uninterrupted period where the main UI thread is busy for 50ms or longer". A click that arrives
in the middle of one is not dropped, it waits, and the frame that would have shown a response waits
with it.

The metric that catches this in the field is INP, Interaction to Next Paint. It measures "the time
from the start of the interaction to the moment the next frame is fully presented", watching every
click, tap and keypress in a visit and reporting the longest one after discarding outliers. Good is
200ms or below at the 75th percentile. INP counts three stretches: the input delay before your
handler starts, the handler itself, and the presentation delay before the frame appears. A long task
in any of them is the same debt.

Three responses, in the order they should be reached for.

**Do less work.** The cheapest win, and the one most often skipped, is moving a computation to where
the data changes instead of running it where the data is read. An index rebuilt on every keystroke
only needs rebuilding when its source changes, and often does not need rebuilding in the browser at
all. Nothing about scheduling rescues work that should not be running, which is why
[memo and what it cannot fix](./memo-and-what-it-cannot-fix.md) puts memoisation last.

**Yield, so input can be handled.** `startTransition` marks a state update interruptible and gives
you an `isPending` flag while it is in flight; `useDeferredValue` is the same idea shaped as a value
rather than a callback. Be precise about what that buys: a transition does not make the work faster
and does not run it off the main thread. It gives React permission to abandon a render in progress
when something more urgent arrives and to run it again afterwards, so total work can go up while the
keystroke paints on time. Outside React, `scheduler.postTask()` queues a callback at a priority, and
`scheduler.yield()` awaits a break and resumes in a fresh task. MDN is blunt about the second one:
"this feature is not Baseline because it does not work in some of the most widely-used browsers", so
ship a fallback rather than assuming it.

**Move it off the thread.** A worker is a real background thread with no DOM access, and it is the
right answer when the work is CPU-bound and self-contained: parsing a large file, diffing, hashing,
image processing. The boundary is real, though. "Data passed between the main page and workers is
copied, not shared", so anything that has to touch the DOM stays where it is, and work that was
waiting on the network was never the thread's problem in the first place.

## Worked example

A filter over a large list, with the input's update kept urgent and the list's marked interruptible:

```jsx
function NoteSearch({ index }) {
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [isPending, startTransition] = useTransition();

  const results = useMemo(() => index.search(applied), [index, applied]);

  function onChange(event) {
    setQuery(event.target.value); // urgent: the input has to paint
    startTransition(() => setApplied(event.target.value)); // interruptible: the results
  }

  return (
    <>
      <input value={query} onChange={onChange} />
      <Results items={results} stale={isPending} />
    </>
  );
}
```

The input owns its own state, so it repaints whatever the list is doing. Type again while the results
render and React drops the render in progress and starts the newer one. `isPending` is the handle for
dimming the old results instead of replacing them with a spinner.

When the expensive thing is a loop rather than a render, chunk it and hand the thread back between
chunks:

```js
async function indexAll(files) {
  for (const [i, file] of files.entries()) {
    parse(file);
    if (i % 50 === 49) await yieldToMain();
  }
}

function yieldToMain() {
  if ('scheduler' in globalThis && 'yield' in globalThis.scheduler) {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
```

Each `await` ends the current task, which is what lets a pending click and a repaint take their turn
before the next fifty files. The loop finishes slightly later than it would have; the page stays
usable while it runs.

## Traps

**The component is wrapped in memo and it still drops frames.** `memo` skips a render when props are
unchanged, and a `filter` prop changes on every keystroke, so the render happens regardless and the
cost is inside it: filtering and sorting twenty thousand rows, per keypress. Re-render count and
render cost are separate levers, and only one of them is memo's job.

**Moving the expensive computation into an effect made it worse.** An effect runs after the commit,
so the browser paints once without the result, the effect sets state, and a second render follows.
That is two passes for one change, and the work still reruns on renders that changed something
unrelated. Key it to what it depends on with `useMemo`, or compute it once where the data is written.

**Wrapping the input's own setState in a transition made typing worse.** react.dev states the limit:
"Transition updates can't be used to control text inputs." The value the input reads has to be
urgent. Only the derived update goes in the transition, and `useDeferredValue` is the shorter way to
say the same thing when there is one value doing the deriving.

**The work moved to a worker and the page still stutters.** Posting the data copies it, and the copy
runs on the thread you were trying to protect. Transfer an `ArrayBuffer` instead, which moves it with
"a zero-copy operation", or send less across the boundary. A worker is a thread, not a shortcut past
serialisation.
