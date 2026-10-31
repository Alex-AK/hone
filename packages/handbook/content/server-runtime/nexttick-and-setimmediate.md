---
title: nextTick, microtasks and setImmediate
question: Two callbacks are both scheduled for "soon". Which one actually runs first?
order: 2
practise:
  - node-esm-flips-tick-order
  - node-nexttick-before-promise
  - node-nexttick-starves-the-loop
  - node-immediate-before-timeout-in-io
sources:
  - author: Node.js
    title: The Node.js Event Loop
    url: https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick
  - author: Node.js
    title: 'Process: process.nextTick(callback[, ...args])'
    url: https://nodejs.org/api/process.html#processnexttickcallback-args
  - author: Node.js
    title: 'Process: When to use queueMicrotask() vs. process.nextTick()'
    url: https://nodejs.org/api/process.html#when-to-use-queuemicrotask-vs-processnexttick
  - author: Node.js
    title: 'Timers: setImmediate(callback[, ...args])'
    url: https://nodejs.org/api/timers.html#setimmediatecallback-args
  - author: libuv
    title: 'Design overview: The I/O loop'
    url: https://docs.libuv.org/en/v1.x/design.html
verified: 2026-08-03
---

Node has several ways to schedule a function to run soon, and they do not mean the same soon. Some
run before Node is allowed to do anything else, and one waits until Node has checked for new network
traffic and fired any timers that are due. Picking the wrong one can freeze a server even though
every individual piece of work is fast.

## The model

[The event loop](../javascript/the-event-loop.md) has the base model: one thread, a job runs to
completion, and the microtask queue is drained before the next task starts. Node keeps every word of
that and adds two things the browser has no equivalent of. Its loop is made of named phases, and it
has a second queue that runs ahead of the microtask queue.

The phases run in a fixed order, and each one holds a different kind of callback:

```
    +--> timers ............... setTimeout, setInterval
    |    pending callbacks .... deferred I/O callbacks
    |    idle, prepare ........ internal
    |    poll ................. new I/O, and the callbacks for it
    |    check ................ setImmediate
    |    close callbacks ...... socket.on('close')
    +----+

    after every callback, and between every phase:
      drain the nextTick queue to empty, then the microtask queue to empty
```

That last line is the part that decides most orderings. `process.nextTick` "adds callback to the
'next tick queue'. This queue is fully drained after the current operation on the JavaScript stack
runs to completion and before the event loop is allowed to continue." It is not a phase, so it is
not somewhere the loop travels to; it happens between everything.

Promise callbacks sit in the microtask queue, one step further out. Node drains the nextTick queue
first and the microtask queue "immediately after", and it alternates until both are empty, so a
promise callback that queues a `nextTick` does not preempt the drain it is already in.

Which leaves `setImmediate`. Its name promises the fastest of the three and it is the slowest: it is
the check phase, so it costs a whole turn of the loop. That is what makes it the useful one. A
`nextTick` or a promise callback runs before the loop is allowed to move, however many of them you
queue. A `setImmediate` callback runs after the loop has been round to read its sockets and fire its
timers.

Two orderings fall out, and they are the two people get wrong. Inside an I/O callback the loop is
already in the poll phase and check is the next phase it reaches, so `setImmediate` beats
`setTimeout(fn, 0)` every time: 200 out of 200 runs here. From the top of the main module the loop
has not started, so which one wins depends on how long process startup took relative to the timer.
Node documents that as non-deterministic, and it measures that way: over 200 fresh processes,
`setImmediate` came first 173 times and `setTimeout` came first 27.

One more thing worth knowing before you reach for it: `process.nextTick` has been **Legacy** since
Node 22.7.0 and 20.18.0, with the docs recommending `queueMicrotask()` instead. Reading its ordering
is still required, because libraries and the runtime are full of it. Writing new calls to it is not.

## Worked example

Four lines, four moments:

```js
setTimeout(() => console.log('timeout'));
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('tick'));
console.log('sync');
```

In a CommonJS file that logs `sync tick promise timeout`. The script is one job and finishes first,
then the nextTick queue drains, then the microtask queue, and only then does the loop reach a phase
where a timer can fire.

Save the same four lines as `.mjs` and it logs `sync promise tick timeout`. That is not a bug, and
Node explains it: "in CJS modules `process.nextTick()` callbacks are always run before
`queueMicrotask()` ones. However since ESM modules are processed already as part of the microtask
queue, there `queueMicrotask()` callbacks are always executed before `process.nextTick()` ones since
Node.js is already in the process of draining the microtask queue." A `.then` callback goes in the
same queue as `queueMicrotask`, so it moves with it. Module evaluation is the only place any of this
happens: inside a timer or an I/O callback, both file types log `tick promise`.

Scheduling the next iteration of a job queue is where the choice has consequences:

```js
function drainNext() {
  const job = queue.shift();
  if (!job) return;
  handle(job);
  process.nextTick(drainNext); // or setImmediate(drainNext)
}
```

Two hundred jobs of roughly a millisecond each, in a process that is also running an HTTP server and
a 1ms interval. With `process.nextTick`: 201ms, zero requests answered, zero timer ticks. With
`setImmediate`: 215ms, every request answered, 199 timer ticks. Fourteen milliseconds buys back the
rest of the process.

## Traps

**The server stops answering while a queue drains, and no single callback is slow.** Something is
refilling the nextTick queue or the microtask queue while it is being drained, and Node empties both
to exhaustion before the loop is allowed to continue. The docs name it: "It's possible to create an
infinite loop if one were to recursively call `process.nextTick()`." Every job here finished in
about a millisecond and the process still served nothing for two hundred of them. Recursion that has
to yield belongs on `setImmediate`.

**The same file logs a different order once it becomes an ES module.** A `nextTick` scheduled during
module evaluation lands behind the promise callbacks, because ESM evaluation is itself running
inside the microtask drain. Anything whose correctness depends on that ordering is code to rewrite
rather than code to port.

**`setTimeout(fn, 0)` won on your laptop and lost in CI.** Racing it against `setImmediate` from the
top of the main module is undefined, and it really does flip: 27 times in 200 here. Inside an I/O
callback the answer is fixed and it is `setImmediate`, so schedule from there or stop depending on
the order.

**Marking the slow function `async` freed nothing.** `async` decides how a result is delivered, not
which thread computes it, and awaiting an already-resolved value is a microtask boundary rather than
a turn of the loop, so no socket gets read in it. Either yield deliberately with `setImmediate`
between chunks, or move the work off the thread, which
[one thread, many connections](./one-thread-many-connections.md) costs out.
