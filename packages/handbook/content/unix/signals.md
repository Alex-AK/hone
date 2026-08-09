---
title: Signals, and what SIGTERM asks of you
question: The platform sent SIGTERM and then killed the container anyway. What was it waiting for?
order: 3
practise:
  - node-sigterm-listener-removes-the-exit
  - node-exit-in-the-sigterm-handler
  - node-close-keeps-a-busy-connection
  - debug-fire-and-forget-work
sources:
  - author: Linux man-pages
    title: signal(7)
    url: https://man7.org/linux/man-pages/man7/signal.7.html
  - author: Linux man-pages
    title: kill(2)
    url: https://man7.org/linux/man-pages/man2/kill.2.html
  - author: Node.js
    title: 'Process: signal events'
    url: https://nodejs.org/api/process.html#signal-events
  - author: Node.js
    title: 'HTTP: server.close, server.closeIdleConnections, server.keepAliveTimeout'
    url: https://nodejs.org/api/http.html
verified: 2026-08-09
---

## The model

A signal is a number delivered to a process by the kernel, and that is nearly all it is. There is no
payload, no reply and no acknowledgement. What decides the outcome is the process's **disposition**
for that signal: `signal(7)` puts it as "each signal has a current disposition, which determines how
the process behaves when it is delivered the signal". Three dispositions exist, and only three: take
the default action, ignore it, or run a handler.

The defaults are what make signals feel like violence. For both SIGTERM and SIGINT the default action
is to terminate the process. Two signals have no disposition to set at all: "the signals **SIGKILL**
and **SIGSTOP** cannot be caught, blocked, or ignored", which is exactly why SIGKILL is what a
platform reaches for when asking politely did not work.

That gives the shape of every shutdown you will ever debug. Something sends SIGTERM, meaning "please
stop". It starts a clock. When the clock runs out it sends SIGKILL, which is not a request. Everything
you can influence happens inside that window, and the window is a setting somewhere you did not write.

```
   SIGTERM ──────────── grace period ──────────▶ SIGKILL
      │                                             │
   your handler runs                         nothing runs
   stop accepting                            nothing is flushed
   finish in flight                          whatever was in memory is gone
   let the loop empty
      │
   process exits
```

Two facts about Node sit on top of that and are the source of most of the surprises.

**Installing a listener removes the default.** Node's documentation is explicit: SIGTERM and SIGINT
"have default handlers on non-Windows platforms that reset the terminal mode before exiting with code
`128 + signal number`", and "if one of these signals has a listener installed, its default behavior
will be removed (Node.js will no longer exit)". So the moment you write `process.on('SIGTERM', ...)`
you have taken ownership of ending the process. A one-line handler that only logs is a process that
now has to be killed.

**Nothing needs to call exit.** Node ends when the event loop has nothing left in it, so a shutdown is
a matter of removing work rather than of issuing a command: stop accepting, let what is in flight
finish, close the pool. `process.exit()` is the opposite of that and drops whatever was pending.

One more, for containers: a process running as PID 1 gets no default dispositions at all. `kill(2)`
records the rule as "the only signals that can be sent to process ID 1, the init process, are those
for which init has explicitly installed signal handlers". So a Node process that is PID 1 and has no
SIGTERM listener does not stop on SIGTERM. It ignores it and waits to be killed.

## Worked example

The full sequence, and the part that gets left out:

```js
process.on('SIGTERM', () => {
  logger.info('shutting down');

  // Stops the listener, and closes the connections that are idle right now.
  server.close(() => pool.end());

  // Reaps them as they *become* idle, which close() does not revisit.
  setInterval(() => server.closeIdleConnections(), 20).unref();
});
```

There is no `process.exit()` in that handler, and that is the point: once the listener is closed, the
pool is ended and the last response is written, the loop is empty and Node leaves on its own.

Measured on Node 24.16.0, against one keep-alive client with a request in flight when the signal
arrived:

| Handler                               | Response delivered  | Process exited    |
| ------------------------------------- | ------------------- | ----------------- |
| `process.exit(0)`                     | never, `ECONNRESET` | 3ms after SIGTERM |
| `server.close()` alone                | 255ms               | 6.0s after that   |
| `close()` plus `closeIdleConnections` | 255ms               | 3ms after that    |

The middle row is the one worth staring at. Nothing was wrong: the response went out, the code looked
correct, and the process sat there for six more seconds because a keep-alive socket that was busy
during `close()` is kept, and nothing revisits it until `keepAliveTimeout` fires. Whether that costs
you anything depends entirely on how it compares to the grace period.

## Traps

**Every deploy takes the full grace period now.** Somebody added a SIGTERM listener, which removed the
default that used to exit, and the handler does not end the process itself. The log line appears, so
it looks like it worked. Check what the handler does after it logs.

**Clients see connection resets during every deploy.** The handler calls `process.exit()`, which ends
the process while a response is still being written. `server.close()` had returned immediately because
it is asynchronous, and the exit did not wait for it. Give `close` a callback, or set
`process.exitCode`, and let the loop empty.

**The shutdown is clean and the process is still killed.** The listening socket closed, but a
keep-alive connection stayed open past the grace period. `server.close()` closes what is idle at the
moment it is called; anything mid-request survives it and then waits out `keepAliveTimeout`, five
seconds by default. Call `closeIdleConnections()` as connections free up, and check that number
against your platform's window.

**In the container it ignores SIGTERM entirely.** PID 1 has no default signal dispositions, so a
process with no handler simply does not respond. It also happens one level up: a shell wrapper that
forks rather than execs receives the signal itself and never passes it on. Measured here, a shell
running `node app.js; echo done` died on SIGTERM and left `node` behind as an orphan, while the same
shell given `node app.js` alone execs it and the signal reaches Node.
