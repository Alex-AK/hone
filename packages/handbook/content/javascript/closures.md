---
title: Closures, and the value that went stale
question: My callback is using a value that is several updates old. Where did it get it?
order: 8
practise:
  - js-closure-per-call
  - js-closure-var
  - react-stale-closure
  - code-once
  - code-memoize
sources:
  - author: MDN
    title: Closures
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures
  - author: MDN
    title: for
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for
verified: 2026-08-02
---

A function in JavaScript remembers the variables around the place it was written, and can still read
them long after that code has finished running. It does not keep a snapshot of them, though: it
reads whatever the variable holds at the moment it runs. When a callback seems to be using an old
value, it is almost always holding on to a different variable from the one you were looking at.

## The model

**A closure captures the binding, not the value.** MDN's definition is a function bundled with
references to its surrounding state, created every time a function is created. References is the load-
bearing word: the function looks the variable up when it runs, not when it was written, so a variable
reassigned in between is seen at its new value.

```js
let outer = 1;
const read = () => outer;
outer = 2;
read(); // 2
```

**Two closures over the same binding share it.** That is the useful half, and it is how a counter, a
`once` wrapper or a memo cache works at all: the state lives in a scope nobody else can reach, and the
functions that closed over it are the only interface to it.

**A stale value means the binding was a different one.** If the function is reading an old value, it
did not go stale; it closed over a binding that stopped being the current one. Two ways that happens.
With `var` there is one function-scoped binding, so every closure made in the loop shares it, and by
the time any of them runs the loop has finished. With `let`, each iteration gets its own: MDN's `for`
documentation describes updates to `i` as creating "new variables called `i`", and the loop body sees
"the next new binding". The other way is re-creation: a function defined during a render closes over
that render's variables, so a callback registered once and never replaced is still reading the first
render's values, however many have happened since.

## Worked example

The loop, both ways, and the reason:

```js
const fns = [];
for (var i = 0; i < 3; i++) fns.push(() => i);
fns.map((f) => f()); // [3, 3, 3] — one binding, read after the loop ended

const better = [];
for (let j = 0; j < 3; j++) better.push(() => j);
better.map((f) => f()); // [0, 1, 2] — a binding per iteration
```

Sharing on purpose, which is the same mechanism pointed the other way:

```js
function counter() {
  let n = 0; // reachable only through the two functions below
  return { inc: () => ++n, read: () => n };
}

const c = counter();
c.inc();
c.inc();
c.read(); // 2
```

## Traps

**Every callback in the loop uses the last value.** Classic `var`, and the fix is `let` or `const` in
the loop header, which gives each iteration its own binding. `for...of` and `forEach` avoid it too,
because the body is a fresh scope each time round.

**An effect or a subscription reads state from several updates ago.** The handler was created once,
closed over that render's variables, and nothing has replaced it since. Either let it be re-created
when its dependencies change, or read through something that is not captured, a ref or the functional
form of a state update, so the value is fetched at call time rather than at creation time.

**A closure keeps something large alive.** The captured scope lives as long as the function does, so a
memo cache or a long-lived listener holding a closure over a big array keeps that array reachable and
therefore uncollectable. This is a normal cost and only becomes a leak when the function outlives its
usefulness, which is exactly what an unremoved event listener is.
