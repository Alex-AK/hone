---
title: The event loop
question: What does blocking actually mean when there is only one thread?
order: 5
practise:
  - debug-blocked-render
  - js-microtask-order
  - debug-async-foreach
  - js-await-in-loop
  - debug-try-catch-async
  - js-await-suspends-caller
  - dates-timer-drift
sources:
  - author: MDN
    title: JavaScript execution model
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model
  - author: MDN
    title: Using microtasks in JavaScript with queueMicrotask()
    url: https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide
  - author: MDN
    title: setTimeout()
    url: https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout
  - author: WHATWG
    title: 'HTML Standard: Event loops'
    url: https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model
verified: 2026-08-01
---

## The model

One thread runs your JavaScript, and everything else follows from that.

Work arrives as queued jobs, and the loop takes one, runs it to the end, and only then looks at
anything else. MDN puts the guarantee in one sentence: "whenever a function runs, it cannot be
preempted and will run entirely before any other code runs". A click that happened, a timer that came
due, a response that arrived: all of them wait, because there is nowhere else for them to run.

Between jobs there are two queues rather than one. MDN: "Microtasks have higher priority and the
microtask queue is drained first before the task queue is pulled." Promise callbacks, `await`
continuations and `queueMicrotask` go in the microtask queue. Timers, events and I/O callbacks are
tasks.

Drained is the exact word. A microtask that queues another microtask does not get deferred to the next
round: "the event loop will keep calling microtasks until there are none left in the queue, even if
more keep getting added". Rendering, in a browser, happens between tasks and not during them.

So blocking means a single job that does not return. While it runs there is no rendering, no input
handling and no callback of any kind, whatever queue it is sitting in. Async does not add a thread. It
gives control back to the loop so that something else can run while the work happens elsewhere, in the
network stack, on disk, or in another process.

## Worked example

Five lines, five different moments:

```js
console.log('1 sync');

setTimeout(() => console.log('5 task'), 0);

Promise.resolve().then(() => {
  console.log('3 microtask');
  Promise.resolve().then(() => console.log('4 queued during the drain'));
});

console.log('2 sync');
```

The whole script is one job, so both synchronous logs come first. The microtask queue drains next, and
the microtask queued from inside it joins the same drain rather than waiting. The timer, due
immediately, goes last.

What "blocking" looks like from the same angle:

```js
setTimeout(() => console.log('due immediately'), 0);

const until = Date.now() + 2000;
while (Date.now() < until) {} // two seconds in which nothing else can happen
```

The timer was ready after zero milliseconds and runs after two thousand of them.

## Traps

**The page freezes and the spinner you set never appears.** The loop that made it slow is one job, so
the browser cannot re-render until the job returns, and the DOM change you made just before it is
still queued behind you. Break the work into chunks that return to the loop, or move it to a worker.

**`setTimeout(fn, 0)` fired much later than 0.** The delay is a floor, not a promise: "the actual
delay may be longer than set". Nesting makes it worse, because "browsers will enforce a minimum
timeout of 4 milliseconds once a nested call to `setTimeout` has been scheduled 5 times", which is why
timer-driven animation loops drift.

**`await` did not make anything parallel.** `await` yields, it does not start work, so awaiting inside
a loop runs the requests one after another and the total is the sum of them. Create every promise
first, then wait once: `await Promise.all(ids.map((id) => fetchUser(id)))`.

**Promises resolve happily and a timer never runs.** A microtask that queues another microtask keeps
the drain going, and the loop cannot reach the task queue until it is empty. MDN warns about it
directly: "there's a real risk of getting the event loop endlessly processing microtasks". Recursion
belongs on a task queue, so use `setTimeout` when you want the loop to breathe.
