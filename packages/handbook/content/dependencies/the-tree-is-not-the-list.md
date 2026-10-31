---
title: The tree is not the list
question: I never installed this package. Why is it in node_modules, and why can I import it?
order: 2
practise:
  - dep-phantom-import
  - dep-one-package-two-versions
  - dep-who-pulled-it-in
  - dep-why-paths
  - dep-workspace-protocol-publishes
sources:
  - author: Node.js
    title: 'Modules: CommonJS modules'
    url: https://nodejs.org/api/modules.html
  - author: pnpm
    title: Motivation
    url: https://pnpm.io/motivation
  - author: pnpm
    title: Symlinked node_modules structure
    url: https://pnpm.io/symlinked-node-modules-structure
  - author: pnpm
    title: Node-Modules & Hoisting Settings
    url: https://pnpm.io/settings/node-modules
  - author: pnpm
    title: pnpm why
    url: https://pnpm.io/cli/why
verified: 2026-08-04
---

Installing one package installs everything it depends on, and everything those depend on, so your
project's dependency folder holds far more than you asked for. Whether your own code can import one
of those extras depends on how your package manager arranges them on disk, not on what you declared.
Code that leans on an undeclared package works until that arrangement changes.

## The model

**You declare a list and you install a graph, and two separate decisions shape that graph:
resolution and layout.** `apps/server/package.json` names nineteen packages; the workspace they
resolve into holds several hundred, and you did not choose any of them.

**Resolution** decides which versions exist. Every package in the tree declares its own ranges, and
the resolver has to satisfy every edge at once. Where two ranges overlap it can use one copy for
both. Where they do not, it installs both versions, so a package appearing twice is the normal
outcome rather than a bug. `pnpm why esbuild -r` reports three esbuild versions in this repo, pulled
in by drizzle-kit, vite and tsx.

**Layout** decides where those versions sit on disk, and your package manager makes that choice.
Package managers disagree here more than anywhere, so this page always names one. Layout matters
because Node's resolution is a directory walk: for a bare specifier, the Node docs describe looking
in the current module's `node_modules`, then the parent directory's, and so on up to the root. Node
takes the first `node_modules` that has the name. It never checks whether you declared it.

That walk is what makes a flat layout work, and it is also what makes a **phantom dependency**
possible: you import something you never declared, it resolves because a package manager put it
somewhere your walk passes through, and your build breaks the day that package manager arranges the
tree differently.

```
hoisted (npm, Yarn Classic, pnpm --node-linker=hoisted)

  node_modules/
    express/            declared
    qs/                 not declared, hoisted out of express
    body-parser/        not declared
    ... 62 more         not declared

  require('qs') from your code -> walks up -> finds it -> works, until it does not

isolated (pnpm's default)

  node_modules/
    express -> .pnpm/express@5.2.1/node_modules/express
    .pnpm/
      express@5.2.1/node_modules/
        express/        the package
        qs -> ...       reachable only from inside express
        body-parser -> ...

  require('qs') from your code -> walks up -> nothing -> MODULE_NOT_FOUND
```

pnpm's default is `isolated`: dependencies are symlinked from a virtual store at
`node_modules/.pnpm`, and only the project's direct dependencies are linked into the root. The
refusal is deliberate, as pnpm puts it: "a great bonus of this layout is that only packages that are
really in the dependencies are accessible." Setting `nodeLinker: hoisted` gives you back a flat
`node_modules` without symlinks, which pnpm's docs describe as the same as npm's or Yarn Classic's.

### One kind of edge is not a download at all

In a workspace, some nodes are your own packages. `apps/server` declares
`"@hone/shared": "workspace:*"`, and pnpm "will refuse to resolve to anything other than a local
workspace package". The lockfile records a path where every other entry has a version and a hash,
because there is nothing to fetch:

```
'@hone/shared':
  specifier: workspace:*
  version: link:../../packages/shared
```

On disk it is a symlink straight at the source directory, so there is no copy to go stale, and
`packages/shared/package.json` still decides what a consumer sees: its `exports` point at `dist`,
which is why `pnpm dev` builds that package before starting anything. The specifier is also
temporary. On publish, pnpm replaces `workspace:` dependencies with the matching version from the
workspace, so a published package carries an ordinary range and nobody downstream sees the protocol.

## Worked example

Measured with pnpm 11.5.0 on Node 24.16.0, like every tree and count on this page. One scratch
project, one dependency, `express@^5.1.0`. Same manifest and lockfile both times; only the linker
changes.

```
$ pnpm install                                 # isolated, the default
  top-level entries: 1  -> express
  require('express')     ok
  require('qs')          MODULE_NOT_FOUND
  require('body-parser') MODULE_NOT_FOUND

$ pnpm install --config.node-linker=hoisted
  top-level packages: 65
  require('express')     ok
  require('qs')          ok
  require('body-parser') ok
```

Sixty-four packages went from unimportable to importable, and nothing about what you declared
changed. Every one of them is a phantom dependency waiting to happen.

The same install shows resolution and layout pulling in different directions. One more package was
installed than could sit at the top, because two of them share a name:

```
$ pnpm why content-type
content-type@1.0.5
└─┬ express@5.2.1                    express declares ^1.0.5
  └── hoistlab@1.0.0 (dependencies)

content-type@2.0.0
├─┬ body-parser@2.3.0                body-parser declares ^2.0.0
│ └─┬ express@5.2.1
└─┬ type-is@2.1.0                    type-is declares ^2.0.0

Found 2 versions of content-type
```

The ranges do not overlap, so both versions are installed. A flat layout can host only one of them
at the root, so it puts 2.0.0 there and nests 1.0.5 inside express, which is why a "flat"
`node_modules` is never quite flat.

This repo shows the other side. `apps/server` declares `@nestjs/platform-express`, which depends on
express, so express is definitely installed. From `apps/server`:

```
@nestjs/platform-express  ->  node_modules/.pnpm/@nestjs+platform-express@11.1.28_.../…
express                   ->  MODULE_NOT_FOUND
kysely                    ->  MODULE_NOT_FOUND
```

Workouts depend on the same rule. A workout workspace symlinks its `node_modules` straight at
`packages/workouts`, so the dependencies in `packages/workouts/package.json` are exactly what a
workout can import, and `qs`, `body-parser` and `class-validator` all fail to resolve there even
though the first two are sitting inside express. Adding a library to a workout is an edit to that
manifest, not something you can arrange from inside the workout.

## Traps

**It runs locally and CI says `Cannot find module`.** A phantom dependency: your code imports
something only reachable because a hoist put it in your walk, and the machine that installed at a
different moment, or with a different package manager, arranged the tree differently. The fix is a
line in `package.json`, not a reinstall, and it is right even when the package was already there by
accident, because you were depending on it either way.

**Two copies of a library, and identity checks stop working.** `instanceof` compares against one
constructor, a registry holds one map, a symbol is unique per module instance. Two versions of the
same package mean two of each, and the error blames whichever line noticed first.
[Values and references](../javascript/values-and-references.md) is the underlying rule;
[Peer dependencies](./peer-dependencies.md) is how a library says it must not be duplicated.

**Removing a dependency broke something that does not use it.** You removed the package that was
hoisting a phantom into place. The tree shrank, the walk stopped finding it, and the failure landed
in unrelated code.

**The vulnerable package is three levels down and you cannot find who wants it.** `pnpm why` answers
that, printing the package at the root with every package that depends on it below. Follow the
branches down to the first name you declared, because that is the only one you can move.

**`pnpm why` finds the package and your import cannot.** Run `pnpm why kysely` from anywhere in this
repo and it reports `@hone/server` among the dependents, reached through drizzle-orm, which lists
kysely as an optional peer. Import it from `apps/server` and you get `MODULE_NOT_FOUND`, because who
wants a package and what a directory may resolve are two different graphs. Your code runs against
the second, so check it the way your code will: from the directory the file lives in.
