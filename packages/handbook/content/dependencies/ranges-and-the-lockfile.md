---
title: Version ranges, and what a lockfile is for
question: We have the same package.json. Why did your machine end up with different code from mine?
order: 1
practise:
  - dep-caret-below-one-zero
  - dep-tilde-and-caret-agree
  - dep-range-and-a-prerelease
  - dep-lockfile-two-machines
  - dep-satisfies-caret
  - dep-compare-versions
sources:
  - author: Tom Preston-Werner
    title: Semantic Versioning 2.0.0
    url: https://semver.org/spec/v2.0.0.html
  - author: npm
    title: node-semver
    url: https://github.com/npm/node-semver
  - author: npm
    title: package.json
    url: https://docs.npmjs.com/cli/v11/configuring-npm/package-json
  - author: npm
    title: package-lock.json
    url: https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json
  - author: pnpm
    title: pnpm update
    url: https://pnpm.io/cli/update
verified: 2026-08-04
---

Your project's list of dependencies usually names a range of versions it will accept rather than one
exact version, so installing on a different day can pull in different code. A lockfile writes down
exactly what one install chose, so every machine after it gets the same thing. Lose it, or never
commit it, and two people with identical project files end up running different packages.

## The model

Your project writes down its dependencies twice, and the two writings answer different questions.

`package.json` holds a **range**: the set of versions you are willing to accept, re-evaluated from
scratch every time somebody resolves it. The lockfile holds the **result** of one such resolution:
one exact version per package, with the URL it came from and a hash of the bytes. npm's description
of its own lockfile is the whole reason the file exists. It "describes the exact tree that was
generated, such that subsequent installs are able to generate identical trees, regardless of
intermediate dependency updates."

So two machines with the same `package.json` do not have the same code. They have the same shopping
list, evaluated on different days.

```
package.json          resolution              pnpm-lock.yaml         node_modules
"^5.7.3"        ->    what is published  ->   5.9.3              ->  typescript 5.9.3
                      at this moment          + sha512 of the
a set of versions                             tarball                the bytes
evaluated at          a moving target,        written once,          on disk
install time          not a constant          read forever
```

### What a range is promising

Semver 2.0.0 is the publisher's half, and it is a promise about intent rather than a mechanism.
Patch "MUST be incremented if only backward compatible bug fixes are introduced", minor "MUST be
incremented if new, backward compatible functionality is introduced", major "MUST be incremented if
any backward incompatible changes are introduced to the public API". Nothing checks any of this. A
publisher who breaks you in a patch has broken a convention, not a rule, and your install still
went through.

Ranges are the consumer's half, and node-semver is what actually evaluates them. A caret allows
"changes that do not modify the left-most non-zero element in the `[major, minor, patch]` tuple".
Read that sentence twice, because the phrase "left-most non-zero" is where the surprise lives.
Expanded by semver 7.8.5:

```
range      expands to           accepts            refuses
^5.7.3     >=5.7.3 <6.0.0-0     5.9.3              6.0.0
~5.7.3     >=5.7.3 <5.8.0-0     5.7.9              5.8.0
^0.8.1     >=0.8.1 <0.9.0-0     0.8.9              0.9.0
~0.8.1     >=0.8.1 <0.9.0-0     0.8.9              0.9.0    identical to the caret
^0.0.3     >=0.0.3 <0.0.4-0     0.0.3 only         0.0.4    a pin with extra steps
```

Below 1.0.0 the caret collapses. semver 2.0.0 says why: "Major version zero (0.y.z) is for initial
development. Anything MAY change at any time", and "Version 1.0.0 defines the public API". node-semver
follows that literally, allowing "patch updates for versions `0.X >=0.1.0`, and _no_ updates for
versions `0.0.X`". Thirteen of the ninety-four ranges declared across the five manifests in this
repo that declare anything sit on a 0.x package, `drizzle-orm@^0.45.2` and `kysely@^0.29.4` among
them, and on every one of them the caret you typed means what a tilde would have meant.

Prereleases are excluded from ranges unless you ask for one. `^1.2.3` does not match `1.3.0-beta.1`,
because a version with a prerelease tag "will only be allowed to satisfy comparator sets if at least
one comparator with the same `[major, minor, patch]` tuple also has a prerelease tag". This is why
pinning a beta pins it hard: `^1.2.3-beta.1` matches `1.2.3-beta.4` and stops there.

### What the lockfile adds

Three things per dependency, and it is worth knowing which is which, because the three fail
differently. From this repo's `pnpm-lock.yaml`:

```yaml
apps/server:
  dependencies:
    drizzle-orm:
      specifier: ^0.45.2 # what apps/server asked for
      version: 0.45.2(@electric-sql/pglite@0.5.4)(...) # what it got, peers and all
```

and, once per package, in the `packages` section:

```yaml
drizzle-orm@0.45.2:
  resolution: { integrity: sha512-... } # what the bytes must hash to
```

The specifier is a copy of your range, kept so a tool can notice when the two have drifted apart.
The version is the resolution. The integrity is a check on the download, and it is the half people
forget the lockfile is doing at all.

## Worked example

Every install on this page ran on pnpm 11.5.0 and Node 24.16.0. All four manifests here that mention
TypeScript declare `"typescript": "^5.7.3"`. Not one of them
names 5.9:

```
$ pnpm list --depth 0
hone@1.0.0 /Users/alex/Documents/code/hone (PRIVATE)
│
│   devDependencies:
├── ...
└── typescript@5.9.3
```

The range accepted it, the resolution chose it, and the lockfile is now the only record that 5.9.3
is what everyone gets.

Whether the lockfile actually decides is easy to check. A scratch project asking for `semver: ^7.8.0`,
with the lockfile hand-set to 7.8.3, and 7.8.5 published and available:

```
$ pnpm install
dependencies:
+ semver 7.8.3

$ rm pnpm-lock.yaml && pnpm install
dependencies:
+ semver 7.8.5
```

Same `package.json`, same registry, same minute. The lockfile is the difference, and deleting it is
the same command as upgrading everything at once. That is the whole answer to the question at the top
of this page: whoever installed without the lockfile, or before it was committed, resolved the ranges
again and got whatever was published that day.

Moving deliberately within your ranges is a different command. `pnpm update` "updates all
dependencies, adhering to ranges specified in `package.json`", so it rewrites the lockfile and leaves
`package.json` alone. `pnpm update --latest` is the one that crosses majors: it goes "to their latest
stable version as determined by their `latest` tags (potentially upgrading the packages across major
versions)", which means editing your ranges, which means reading changelogs.

## Traps

**A caret on a 0.x package did nothing you expected.** `^0.8.1` expands to `>=0.8.1 <0.9.0-0`, byte
for byte the same as `~0.8.1`, and `^0.0.3` accepts only 0.0.3. So a 0.x dependency stops receiving
minor releases silently: no error, no warning, and a version that never moves while the changelog
fills up. If you want 0.9 you have to edit the range by hand.

**The lockfile was deleted to fix a broken install, and now something unrelated is broken.** Deleting
it does not repair a tree, it re-resolves every range in the project against today's registry, so
one stuck package becomes a few hundred version changes nobody reviewed. Delete `node_modules` when
an install is wedged. Keep the lockfile.

**The lockfile is not committed, so CI is the only machine that has ever installed cleanly.** A
lockfile that is gitignored is doing none of its three jobs: no shared resolution, no reviewable
diff, and no integrity pin on the download. It belongs in the repository, and its diff is the part
of a dependency PR worth reading.

**The bump was a patch, so it was safe.** Semver is a promise a human makes at publish time, and the
tooling neither verifies nor enforces it. Read the diff of a patch on anything you depend on at
runtime, and treat a 0.x package as making no promise at all, because its own specification says so.

**The new version exists and the install refuses to take it.** Prereleases are outside every range
that does not name one, so `^1.2.3` skips `1.3.0-beta.1` entirely. That is usually what you want,
and it is confusing exactly once: when the fix you need has only shipped as a beta and your range
looks like it should reach it. [Updating, and what a version bump carries](./updating-a-dependency.md)
is where the fix is out of range for a worse reason.
