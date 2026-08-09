---
title: What a process gives you
question: I moved it into its own process. Is it contained now?
order: 1
practise:
  - security-child-process-same-user
  - security-vm-not-a-boundary
  - dep-ignored-build-scripts
  - node-worker-vs-child-process
sources:
  - author: Node.js
    title: VM (executing JavaScript)
    url: https://nodejs.org/api/vm.html
  - author: Node.js
    title: Child process
    url: https://nodejs.org/api/child_process.html
  - author: Linux man-pages
    title: credentials(7)
    url: https://man7.org/linux/man-pages/man7/credentials.7.html
  - author: Linux man-pages
    title: namespaces(7)
    url: https://man7.org/linux/man-pages/man7/namespaces.7.html
verified: 2026-08-09
---

## The model

A process boundary is a fault boundary. That is the whole of what it promises, and it is worth
having: its own address space, so a bug on that side cannot read memory on this one, an exit code,
and a crash or an endless loop that stays where it happened.

What it does not promise is a different identity. `credentials(7)` is explicit: "A child process
created by `fork(2)` inherits copies of its parent's user and groups IDs", and permission checks are
answered from those IDs. So a child opens exactly the files the parent could open and connects
wherever the parent could connect. In Node it also arrives holding your secrets, because `spawn`'s
`env` option defaults to `process.env`.

Worth saying the list out loud once, because the rest of this section is this list being subtracted
from, one line at a time:

| What the child gets  | By default               |
| -------------------- | ------------------------ |
| The user it runs as  | yours                    |
| The filesystem       | yours, whole             |
| The network          | yours, whole             |
| The environment      | yours, secrets included  |
| The kernel it calls  | yours, every system call |
| Memory, CPU and pids | unbounded, same as yours |

`namespaces(7)` says what changing four of those rows costs: a namespace "wraps a global system
resource in an abstraction that makes it appear to the processes within the namespace that they have
their own isolated instance of the global resource." A plain process is in your namespaces, which is
another way of saying it is in none of its own. That is [the next page](./what-a-container-is-made-of.md).

Node's `uid` and `gid` options on `spawn` look like the cheap way to fix row one, and they are not
general: they call `setuid(2)`, which an unprivileged process may not use to become somebody else. A
server running as `app` spawns children running as `app`, and the option is only available to a
parent that already has the privilege to give away.

### A vm realm is less than a process

The thing a web engineer reaches for first is weaker than everything above. Node's documentation is
one sentence: "The `node:vm` module is not a security mechanism. Do not use it to run untrusted
code."

What it gives you is a fresh realm, a separate set of globals, so `typeof process` genuinely is
`undefined` inside it. A realm is a namespace and not a wall, and the wall is missing because objects
cross it. Every value handed into the context is a host object carrying `.constructor`, two hops from
any of them is the host `Function`, and a host `Function` compiles code that evaluates in the host.

`timeout` reads wider than it is. Node documents it as "the number of milliseconds to execute `code`
before terminating execution", which is one synchronous evaluation. It does not follow a callback the
code scheduled, and it cannot undo a write that has already happened.

## Worked example

Hone grades submitted JavaScript in a `node:vm` context, so this repo is the example.
`apps/server/src/grading/code-runner.ts` builds a realm holding a recording `console`, a capped
`setTimeout`, `structuredClone`, `URL`, the text encoders and `AbortController`. No `require`, no
`Buffer`, no `process`.

Three lines, run against exactly that context on Node 24:

```js
runInContext('typeof process', ctx);
// 'undefined'

runInContext("structuredClone.constructor('return process')().env.HOME", ctx);
// '/Users/alex'

runInContext(
  "structuredClone.constructor('return process')()" +
    ".mainModule.require('node:child_process').execSync('id -un').toString().trim()",
  ctx
);
// 'alex'
```

`structuredClone` is a host function, `structuredClone.constructor` is the host `Function`, and from
there the submission has `process`, `require` and a shell, as the user running the server. The
missing global was never the boundary.

The timeout, measured the same way:

```js
runInContext("setTimeout(() => log('still here'), 300)", ctx, { timeout: 50 });
// runInContext returns after 1ms; the callback runs 301ms later
```

None of that is a bug in Hone. It is why `code-runner.ts` carries a note saying the module is a
convenience rather than a boundary and not to reuse it for anyone else's code, and it is why
self-hosting this app was declined rather than solved with a stricter realm. The trust level of a
Hone grade is `pnpm dev`: you are running code you typed yourself, on your own machine.

## Traps

**"`typeof process` is `undefined` in there, so it cannot shell out."** Absence of a global is not
absence of a path to it. Anything you pass in is a host object, and one property lookup from any host
object is the host `Function`. The only realm with nothing reachable is a realm you handed nothing
to, which cannot run a test.

**"The one-second timeout stops it."** It stops one synchronous evaluation. A callback the submission
scheduled keeps its appointment, an already-open socket stays open, and a file that has been written
stays written. A timeout bounds how long code holds the thread, never what it did with the thread it
held.

**"It runs in a child process, so it cannot touch our files."** It runs as you. `cwd` moves where a
relative path starts and jails nothing, an absolute path never consults it, and `env` hands over
`process.env` unless you pass something else. What the child actually buys is the fault boundary:
a segfault or a hang stays in the child.

**"The worker thread is isolated."** A worker gets its own V8 heap and its own thread, which is why
it is the right answer for CPU-bound JavaScript. It is in your process, so it shares the file
descriptors, the environment, the credentials and the address space that a native addon can corrupt.
Isolation of a heap is not isolation of a privilege.

**"The postinstall script only compiles the native module."** A lifecycle script is arbitrary code
running as you, before a line of your own has executed, which is why pnpm blocks them by default and
runs only the packages a workspace names. That is the same model from the other direction: nothing
about being "just a build step" changed what the process was allowed to do.
