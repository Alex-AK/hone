---
title: Your server is a process
question: The code is identical. Why does it behave differently once my terminal is not the thing starting it?
order: 1
practise:
  - node-env-values-are-strings
  - node-cwd-is-not-the-module-directory
  - node-too-many-open-files
  - node-pipeline-over-pipe
  - node-worker-vs-child-process
sources:
  - author: The Open Group
    title: 'POSIX.1-2024, Base Definitions: file descriptor'
    url: https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap03.html
  - author: Linux man-pages
    title: environ(7)
    url: https://man7.org/linux/man-pages/man7/environ.7.html
  - author: Linux man-pages
    title: getrlimit(2)
    url: https://man7.org/linux/man-pages/man2/getrlimit.2.html
  - author: Node.js
    title: Process
    url: https://nodejs.org/api/process.html
  - author: Node.js
    title: Child process
    url: https://nodejs.org/api/child_process.html
verified: 2026-08-09
---

## The model

Your source code is one of five things a running server is made of, and the other four were decided
by whoever started it.

**A parent.** Every process was started by another one, and that is where the next three come from.
On your laptop the parent is a shell. In production it is a process manager, a container runtime or
an init system, and none of those has read your shell profile.

**An environment.** `environ(7)` describes it plainly: a null-terminated array of strings, "by
convention" of the form `name=value`, and a child "inherits a copy of its parent's environment". Two
consequences follow from that sentence and both bite. It is a copy, taken once, so setting a variable
in your shell after the service started changes nothing. And it is strings, only ever strings, so
`DEBUG=false` arrives as five characters that are perfectly truthy.

**A working directory.** One path, a property of the process, chosen by the launcher. A shell uses
wherever you were standing; a process manager usually uses `/`; a container uses whatever `WORKDIR`
said. Every relative path in your code is resolved against it, which makes `./config.json` a question
about the launcher rather than about your repository.

**A table of open file descriptors.** POSIX: "The values 0, 1, and 2 have special meaning and
conventional uses, and are referred to as standard input, standard output, and standard error,
respectively." Everything you open afterwards takes the next free number in the same table, whether
it is a file, a socket, a pipe or a database connection. `RLIMIT_NOFILE` caps how many the process may
hold, and `getrlimit(2)` names what happens at the ceiling: attempts to `open`, `pipe` or `dup` past
it "yield the error **EMFILE**".

**A user and a group.** Two numbers the kernel checks every time the process touches a file or binds
a port. That is [its own page](/handbook/unix/permissions-and-ownership).

```
      parent (shell, systemd, container runtime)
        │  fork + exec
        ▼
      your process
        ├── environ    name=value strings, copied at exec
        ├── cwd        one path, set by the parent
        ├── uid / gid  two numbers
        └── fd table   0 stdin   1 stdout   2 stderr   3.. everything you open
```

## Worked example

Starting a child makes all four visible at once, because every one of them is either inherited or
named:

```js
import { spawn } from 'node:child_process';

// Inherits everything: the environment, the working directory, and fds 0, 1 and 2.
spawn('ffmpeg', args, { stdio: 'inherit' });

// Inherits nothing that is not spelled out here.
spawn('ffmpeg', args, {
  cwd: workDir,
  env: { PATH: process.env.PATH, TMPDIR: tmpDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

Node's defaults are the inheriting ones: `env` defaults to `process.env`, and an absent `cwd` means
"inherit the current working directory". So the second call is the interesting one, and the reason to
write it is that a child given the whole environment is a child given your database password.

The other half is reading, which is worth doing once at the top rather than wherever the value is
needed:

```js
import { join } from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  debugSql: process.env.DEBUG_SQL === 'true',
  // Against the module, not against wherever the process was launched.
  rulesPath: join(import.meta.dirname, 'rules.json'),
};
```

Every environment value is a string, so every read is a coercion or a comparison. Doing them all in
one place means a missing variable fails at boot instead of in the branch nobody took.

## Traps

**It found the file on my machine and not under the process manager.** `ENOENT` on a path that
plainly exists means the relative path was resolved against a working directory you did not expect,
and process managers overwhelmingly start you at `/`. Resolve anything that ships with your code
against `import.meta.dirname`, and keep `process.cwd()` for paths a user typed.

**The variable is set and the service cannot see it.** Exporting it in your shell put it in your
shell's environment, and your service's parent is not your shell. It has to be set on whatever
actually starts the process: the unit file, the compose file, the platform's config. The same rule
explains why a variable set at runtime, with `process.env.X = ...`, reaches only children you spawn
after that line.

**The flag says `false` and the feature is on.** There are no types in an environment. `false`, `0`
and `null` all arrive as text and all three are truthy, so reading a flag is always a comparison
against the string you expect. This survives review because it works on a laptop, where the variable
is usually unset, and fails only in the one environment that bothered to say no.

**Something ran out and the failure appeared somewhere unrelated.** `EMFILE` is the descriptor table
filling up, and it is one table for files, sockets and pipes together. So a handler that opens a file
and forgets to close it eventually breaks the HTTP client, and the stack trace points at the
innocent party. Raising the limit buys time; closing the handle is the fix.
