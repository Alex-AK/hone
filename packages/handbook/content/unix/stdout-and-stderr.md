---
title: Standard output and standard error
question: Redirecting the output broke the tool that reads it. Which stream should this line have gone to?
order: 2
practise:
  - node-progress-on-the-wrong-stream
  - node-log-per-row-costs-the-loop
  - debug-sync-work-in-handler
sources:
  - author: The Open Group
    title: 'POSIX.1-2024, Base Definitions: file descriptor'
    url: https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap03.html
  - author: Linux man-pages
    title: stdio(3)
    url: https://man7.org/linux/man-pages/man3/stdio.3.html
  - author: Node.js
    title: Console
    url: https://nodejs.org/api/console.html
  - author: Node.js
    title: Process
    url: https://nodejs.org/api/process.html
  - author: Adam Wiggins
    title: 'The Twelve-Factor App: Logs'
    url: https://12factor.net/logs
verified: 2026-08-09
---

## The model

A process starts with two output streams, not one. POSIX gives them numbers: file descriptors 1 and
2, "referred to as standard input, standard output, and standard error". `stdio(3)` says what each is
for in a single clause, and it is the whole rule: standard output is "for writing conventional
output", standard error is "for writing diagnostic output".

On your laptop both point at the same terminal, which is the only reason they look like one thing.
They stop looking like one thing the moment anything else consumes them, because they are redirected
separately, piped separately and collected separately:

```
   your process            $ node build.mjs > report.json
   ┌──────────────┐
   │ fd 1  stdout │──────▶ report.json
   │ fd 2  stderr │──────▶ still the terminal, until you say 2> as well
   └──────────────┘
```

So the question "where does this line go" is not about severity. It is about who the line is for. The
report a build script produces is output; the line saying which file it is on is diagnostics. A
progress bar, a spinner and a "connecting to the database" are all diagnostics, however cheerful,
because a program reading your stdout would choke on them. That is also why an uncaught exception's
stack trace goes to stderr, and why `console.error` and `console.warn` write there while
`console.log`, `console.info` and `console.debug` all write to stdout.

Two more facts follow from the streams being descriptors rather than a logging library.

**Buffering differs by what is on the other end.** `stdio(3)`: "the standard error stream is not fully
buffered; the standard input and output streams are fully buffered if and only if the streams do not
refer to an interactive device". That is the C library rather than Node, and it is why so many
command-line tools go silent the moment you pipe them.

**A write is a write.** Node's own note under `process.exit()` is that writes to `process.stdout` "are
sometimes asynchronous and may occur over multiple ticks", and that calling `exit()` forces the
process out before they land. In the other direction, a line of output costs a system call rather
than a memory append, and that cost is paid on the thread serving your requests.

The twelve-factor rule falls out of all of this rather than standing on its own: "each running process
writes its event stream, unbuffered, to `stdout`", and "a twelve-factor app never concerns itself with
routing or storage of its output stream". Writing to a file inside a container puts your logs
somewhere the platform is not looking; writing to fd 1 hands the routing problem to the thing that
already solved it.

## Worked example

A script that a human runs and a machine reads, with the split done properly:

```js
for (const file of files) {
  // Diagnostics: for whoever is watching. Never in the data.
  console.error(`bundling ${file}`);
  report.files.push(await bundle(file));
}

// Output: the reason the script exists.
console.log(JSON.stringify(report));
```

```
$ node build.mjs                 # both land in the terminal, as they always did
$ node build.mjs > report.json   # progress still on screen, report parseable
$ node build.mjs 2>/dev/null     # quiet, and the report is untouched
```

Nothing here is a logging framework, and none of the three invocations needed a flag. That is the
payoff for putting the line on the right descriptor in the first place.

The measured cost of getting the volume wrong, on Node 24.16.0 with stdout redirected to a file:
pushing 20,000 lines into an array took 0.5ms, and writing the same 20,000 to stdout took about 50ms.
Both numbers are spent on the one thread.

## Traps

**The output redirected into a file will not parse.** Something wrote a human-readable line to stdout,
so the data now has prose in it. `SyntaxError: Unexpected token 'b'` is the usual first sign. Move
every line that is not the output itself to `console.error`, including the friendly ones.

**The crash is not in the log aggregator.** Uncaught exceptions and `console.error` go to fd 2, so a
collector wired to stdout alone has every ordinary line and none of the failures. Collect both, or the
first thing you go looking for during an incident is the one thing you did not keep.

**The endpoint got slower after somebody added logging.** A log line is a write to a descriptor, not
an append to a buffer, and 20,000 of them inside a request cost about 50ms of the single thread. Log
once per request with the counts on it, and keep the per-row detail behind a level that is off in
production.

**The last thing it printed never appeared.** `process.exit()` ends the process while writes to stdout
are still in flight, which Node's documentation calls out as a misuse in as many words. Set
`process.exitCode` and let the process leave on its own instead.
