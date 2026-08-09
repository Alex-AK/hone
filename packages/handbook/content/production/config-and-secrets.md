---
title: Configuration, secrets, and where the environment stops
question: VERBOSE_ERRORS is set to false and verbose errors are on. What did the process actually read?
order: 2
practise:
  - sys-config-read-at-boot
  - sys-secret-in-the-environment
  - security-secrets-in-frontend
sources:
  - author: The Twelve-Factor App
    title: Config
    url: https://12factor.net/config
  - author: Node.js
    title: 'process: process.env'
    url: https://nodejs.org/api/process.html#processenv
  - author: OWASP
    title: Secrets Management Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
  - author: Kubernetes
    title: Secrets
    url: https://kubernetes.io/docs/concepts/configuration/secret/
verified: 2026-08-09
---

Every command output below was run against Node 24.16.0.

## The model

Config is what differs between deploys of the same artefact. Twelve-Factor defines it as "everything
that is likely to vary between deploys (staging, production, developer environments, etc)", and
offers a test that settles most arguments about whether something counts: "whether the codebase could
be made open source at any moment, without compromising any credentials."

The environment won as the place to put it because it asks nothing of anybody. Twelve-Factor's reason
is one clause, "a language- and OS-agnostic standard", and every platform can set one, every runtime
can read one. That is also the complete list of what it can do, and the four things it cannot are
where every surprise on this page comes from:

- **Every value is a string.** Node's documentation says so of assignment: "Assigning a property on
  `process.env` will implicitly convert the value to a string", which it demonstrates with
  `env.test = undefined` producing the string `'undefined'`. There is no integer, no
  boolean, and no null. `Boolean('false')` is `true`, because a non-empty string is truthy and
  nothing in the chain knows that string was meant as a boolean.
- **It is flat and global.** Structure is a naming convention, so `DB_` is a prefix rather than an
  object, and nothing prevents two libraries from wanting the same name.
- **It is inherited.** Every process you spawn gets the entire environment, including the parts it
  has no business seeing.
- **It is fixed for the life of the process.** The environment a process has is the one it was handed
  at exec. Changing the value on the platform reaches the next process, not the running one.

What follows from the first point is the discipline: **read the environment once, at boot, into a
typed object, and refuse to start if it does not make sense.** A missing variable should stop a
deploy while somebody is watching it, rather than arriving as `undefined` inside a connection string
at three in the morning.

What follows from the last two is where the environment stops being enough:

- **A secret you have to rotate without a restart.** Nothing updates a running process's environment,
  so rotation is a rolling restart, which is exactly what you do not want during the incident that
  caused the rotation. A file read at the point of use can be rewritten instead, which is why
  Kubernetes offers Secrets as mounted volumes as well as as environment variables and updates the
  volume when the Secret changes.
- **Anything that changes without a deploy.** A feature flag is not config. Config is per release and
  a flag is per request, so if flipping it can wait for a release it is config, and if it has to
  happen in ten seconds it needs a store your code reads.
- **Secrets past a certain value.** OWASP is blunt about the default: "environment variables are
  generally accessible to all processes and may be included in logs or system dumps. Using
  environment variables is therefore not recommended unless the other methods are not possible."

## Worked example

The version that reads the environment where it is needed:

```js
const timeout = Number(process.env.REQUEST_TIMEOUT_MS);
const verbose = Boolean(process.env.VERBOSE_ERRORS);
```

Run with both variables set to the values somebody intended:

```
$ REQUEST_TIMEOUT_MS=5s VERBOSE_ERRORS=false node server.js
timeout    NaN
verbose    true
(node:85889) TimeoutNaNWarning: NaN is not a number.
Timeout duration was set to 1.
gave up after NaN ms
```

Neither variable was missing and neither line threw. `'false'` is a non-empty string, so the flag is
on. `Number('5s')` is `NaN`, and Node accepted it: the timer was set to 1 millisecond, behind a
warning on a line nobody was reading. Every request now times out immediately, and the config looks
correct in the dashboard.

The same values, parsed once at boot:

```js
function required(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') throw new Error(`${name} is not set`);
  return raw;
}

function integer(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} is "${raw}", which is not an integer`);
  return value;
}

function flag(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (raw !== 'true' && raw !== 'false') throw new Error(`${name} is "${raw}", not true or false`);
  return raw === 'true';
}

export const config = Object.freeze({
  port: integer('PORT', 3000),
  databaseUrl: required('DATABASE_URL'),
  requestTimeoutMs: integer('REQUEST_TIMEOUT_MS', 5000),
  verboseErrors: flag('VERBOSE_ERRORS', false),
});
```

Both failures now happen before the server binds a port:

```
$ node server.js
Error: DATABASE_URL is not set
EXIT: 1

$ DATABASE_URL=postgres://localhost/app REQUEST_TIMEOUT_MS=5s node server.js
Error: REQUEST_TIMEOUT_MS is "5s", which is not an integer
EXIT: 1
```

`process.env` appears in exactly one module after this, which is the other thing the shape buys: the
rest of the code reads `config.requestTimeoutMs` and gets a number.

## Traps

**It works when you run the command by hand and not when the platform runs it.** Your shell has
variables in it from a login profile, a `.env` file somebody sourced, or the last export you typed,
and every process you start inherits them. The release inherits none of that. Run it in a shell with
nothing set (`env -i`) before concluding the code is fine.

**The app booted, passed its health check, and failed on the first request that needed the missing
variable.** Reading `process.env` where the value is used spreads the failure across the codebase and
delays it past the point where a deploy could have caught it. Read every variable in one module at
boot, and let a missing one be a non-zero exit. A crash during the deploy is caught by the deploy.

**The secret is in an environment variable and it turned up in an error report.** Crash reporters and
process supervisors serialise the whole environment by default, and anything you spawn inherits it
whether it needs it or not. Redact by allow-list rather than by pattern: the next variable somebody
adds will not be named `*_SECRET`, and a deny-list only knows the names that already existed when it
was written.

**Rotating the credential did nothing until every instance restarted.** Nothing rewrites a running
process's environment, so a rotation you thought was a config change is a rolling restart of the
fleet. Read the credential from a mounted file at the point you open the connection, and rotation
becomes a file write. Short-lived credentials are the same fix taken further, and OWASP's argument
for them is that the window closes by itself: "Should the application's database credentials be
stolen, upon reboot they would be expired."

**The same artefact serves both environments, apart from the values baked into the browser bundle.**
A value substituted at build time is not config at all: it is part of the artefact, so one artefact
cannot serve two environments and a rollback cannot change it. That belongs to
[secrets, and what a bundle publishes](../security/secrets-and-the-bundle.md), which is where the
prefixes and the inlining are; the consequence here is that anything you want to vary per deploy has
to be read by the server at runtime or fetched by the client at startup.
