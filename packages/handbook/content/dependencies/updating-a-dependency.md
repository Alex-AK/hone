---
title: Updating, and what a version bump carries
question: The advisory says fixed in 7.18.0 and my range stops below 7. What am I actually being asked to do?
order: 5
practise:
  - dep-ignored-build-scripts
  - dep-lockfile-integrity-hash
  - dep-who-pulled-it-in
  - security-sri
sources:
  - author: pnpm
    title: Mitigating supply chain attacks
    url: https://pnpm.io/supply-chain-security
  - author: pnpm
    title: Build Settings
    url: https://pnpm.io/settings/build
  - author: pnpm
    title: pnpm update
    url: https://pnpm.io/cli/update
  - author: npm
    title: npm-audit
    url: https://docs.npmjs.com/cli/v11/commands/npm-audit
  - author: GitHub Advisory Database
    title: 'GHSA-337j-9hxr-rhxg: React Router arbitrary constructor injection via deserializeErrors()'
    url: https://github.com/advisories/GHSA-337j-9hxr-rhxg
verified: 2026-08-04
---

Updating a dependency sounds like one action, but it can mean a cheap refresh, a deliberate upgrade
you have to read up on, or chasing a package you never chose. A security advisory tells you which
version fixes the problem; whether your project can reach that version from where it stands is a
separate question. And a version bump brings more than new code: new packages underneath it, and
sometimes code that runs the moment you install.

## The model

**"Updating" is three different operations that cost different amounts, and an advisory's patched
version tells you which one you are being asked for.**

**Move inside the range.** `pnpm update` keeps to the ranges in `package.json`, so only the lockfile
changes. This is the cheap one, and the only one that can fix a patch advisory without a decision.

**Move the range.** Editing `^6.29.0` to `^7.0.0` changes what you accept, which means reading a
changelog. `pnpm update --latest` does it for everything at once, moving each package to its
`latest` tag, across majors if need be.

**Move something you never declared.** A transitive is chosen by whoever depends on it, so you move
it by moving them, by waiting for them, or by forcing it with an override and owning the mismatch.

Which one an advisory needs is arithmetic you can do in your head:

```
  declared        ^6.29.0   ->   >=6.29.0 <7.0.0-0
  installed       6.30.4
  patched in      >=7.18.0
                  ^^^^^^^^ outside the range. No update command reaches this.
```

A fix is reachable only if a version satisfying your range is also patched. When none is, the
remediation is a range edit or nothing, and no amount of re-running the updater will produce it.

### What a version bump actually carries

Three things, and only the first is what you read the changelog for.

**Code**, which semver makes a promise about, and only a promise.
[Version ranges](./ranges-and-the-lockfile.md) has why that promise is weaker than it looks.

**A new transitive closure.** The package you bumped brings its own dependencies, so a one-line
change to `package.json` can move hundreds of lines of lockfile. That diff is the part worth reading
in review.

**Permission to run code on your machine, at install time.** `preinstall`, `install` and
`postinstall` scripts run with your user's privileges, on every machine that installs, before a line
of your own program has run. pnpm 11 blocks them by default and treats any package not listed in
`allowBuilds` as unreviewed.

### The lockfile as a security artefact

Alongside each version it records an integrity hash of the tarball, so a republished or tampered
package fails the check instead of installing. It is also the list scanners read: `npm audit`
sends the registry a description of your dependencies, and npm's docs warn that without a lockfile
the results may differ on every run.

## Worked example

Run against this repository on 2026-08-04, with pnpm 11.5.0 on Node 24.16.0. Advisory data moves,
so read the numbers as an example of the reasoning, not the current state.
`apps/web/package.json` declares one router:

```json
"react-router-dom": "^6.29.0"
```

`pnpm audit` returns two advisories against that chain, and they fail differently.

The first, GHSA-jjmj-jmhj-qwj2, is against `react-router-dom` itself: vulnerable
`>=6.30.2 <=6.30.4`, patched `>=6.30.5`. That looks reachable, because 6.30.5 sits inside
`^6.29.0`. It is not, because 6.30.5 does not exist. Filtering
`pnpm view react-router-dom versions` through the range gives:

```
  published, satisfying ^6.29.0    6.29.0 6.30.0 6.30.1 6.30.2 6.30.3 6.30.4
  highest of those                 6.30.4      the installed one, and the vulnerable one
  anything >=6.30.5 below 7.0.0    none        the patch was never released on the 6 line
```

The second, GHSA-337j-9hxr-rhxg, is a constructor injection in `react-router`, vulnerable
`>=6.4.0 <7.18.0`, patched `>=7.18.0`. `apps/web` has never heard of that package:

```
$ pnpm why react-router
react-router@6.30.4
└─┬ react-router-dom@6.30.4
  └── @hone/web@1.0.0 (dependencies)
```

It is not in `apps/web/node_modules`, and resolving it from `apps/web` gives
`MODULE_NOT_FOUND`. You cannot bump it, because you never chose it. The only lever is the package
above it, and that package's fix lies across a major boundary. Two advisories, two reasons, one
remediation: `react-router-dom@^7` and the migration that comes with it, known before anyone has run
a fixer.

Now the install-time half, on the package this repo cannot run without. A scratch project with
`better-sqlite3@12.11.1` and no build allowlist:

```
$ pnpm install
+ better-sqlite3 12.11.1
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: better-sqlite3@12.11.1
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
EXIT: 0
```

The install exits cleanly and `require('better-sqlite3')` succeeds. The failure arrives later, from
a package two levels down that the error message is the first mention of:

```
$ node -e "new (require('better-sqlite3'))(':memory:')"
node_modules/.pnpm/bindings@1.5.0/node_modules/bindings/bindings.js:135
Error: Could not locate the bindings file. Tried:
 → …/better-sqlite3/build/better_sqlite3.node
 → …/better-sqlite3/build/Debug/better_sqlite3.node
 → …/better-sqlite3/build/Release/better_sqlite3.node
```

The same call inside this repo opens a database, because `pnpm-workspace.yaml` allows exactly three
builds and this is one of them:

```yaml
allowBuilds:
  '@swc/core': true
  better-sqlite3: true
  esbuild: true
```

That allowlist is all there is to audit for install-time code in this workspace. It does
not claim these three are safe forever; it means a fourth cannot appear without somebody adding a
line.

## Traps

**The scanner says a fix is available and no update command applies it.** Do the arithmetic before
you argue with the tool: expand your range, find the highest published version inside it, and check
whether that version is patched. If it is not, you are being asked for a major upgrade, and the
honest options are to do it, to override the transitive and test what breaks, or to write down why
you are accepting the risk.

**The advisory names a package you have never installed on purpose.** It is transitive.
`pnpm why <package>` prints the path back to the workspace, and the first name on that path you
declared is the only one you can move. Everything above it is somebody else's release
schedule.

**One line changed in `package.json` and the lockfile diff is unreadable.** That is the bump's own
dependency tree, and it is the part of the diff that decides whether the upgrade is safe.
Skim it for names you have never seen, and check whether anything new gained the ability to run
install scripts.

**The install succeeded and a native module cannot find its bindings.** A blocked build script,
which the install reported as a notice rather than an error. Review the package and allowlist it
rather than disabling the protection: pnpm warns against allowing everything because existing
packages may add scripts in later versions, and packages can be hijacked.

**The tarball changed and the install refused to proceed.** That is the lockfile's integrity check
at work. pnpm 11.5.0 fails with `ERR_PNPM_TARBALL_INTEGRITY`, prints the hash it wanted beside the
hash it got, and explains that "pnpm will not silently overwrite the locked integrity", because
doing so would defeat the lockfile's protection against a registry or proxy serving tampered
content. Refresh a legitimate republish with `--update-checksums` after you have looked at what
changed.

**Freezing everything is not the safe option.** A tree that never moves accumulates every advisory
published against it, and the eventual upgrade is a year of majors at once.
[install against ci](./install-against-ci.md) has the other side of that dial: reproducibility and
freshness are the same setting.
