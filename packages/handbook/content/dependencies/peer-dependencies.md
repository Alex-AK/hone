---
title: Peer dependencies, and what an unmet one breaks
question: The install warned about an unmet peer and everything still runs. What is that warning actually for?
order: 3
practise:
  - dep-optional-peer-driver
  - dep-unmet-peer-at-runtime
  - dep-react-in-a-published-library
sources:
  - author: npm
    title: package.json
    url: https://docs.npmjs.com/cli/v11/configuring-npm/package-json
  - author: pnpm
    title: Peer Dependency Settings
    url: https://pnpm.io/settings/peer-dependencies
  - author: pnpm
    title: Symlinked node_modules structure
    url: https://pnpm.io/symlinked-node-modules-structure
  - author: React
    title: Invalid hook call warning
    url: https://react.dev/warnings/invalid-hook-call-warning
verified: 2026-08-04
---

Most of what a package depends on comes with it. A peer dependency works the other way: the package
expects the application to supply it, and to share that one copy. When that goes wrong the install
rarely fails. You get a warning or nothing, and later a library that breaks because two copies exist
where there should be one.

## The model

**A peer dependency says "I need this, and it has to be the copy you already have."** A normal
dependency says "I need this, and I will bring my own copy."

npm frames it as the plugin case: a package declaring that it is compatible with a host tool or
library, without necessarily loading that host itself. An ESLint plugin, a Vite plugin, a React
component library. The plugin is written against a host it does not own, and it must run inside the
host the application chose, not one it dragged in on the side.

The reason it matters is module identity. Node caches a module per resolved file path, not per
package name, so two copies of a library are two unrelated modules with two sets of module-level
state. React says exactly what that costs: "the `react` import from your application code needs to
resolve to the same module as the `react` import from inside the `react-dom` package. If these
`react` imports resolve to two different exports objects, you will see this warning."

```
widget declares react as a dependency        widget declares react as a peer

  node_modules/                                node_modules/
    react@19.2.8      <- the app's              react@19.2.8   <- the only one
    widget/                                     widget/
      node_modules/
        react@18.3.1  <- widget's own

  two modules, two dispatchers,                one module, one dispatcher
  hooks throw                                  hooks work
```

### Optional peers, which are a different thing entirely

A peer can be marked optional in `peerDependenciesMeta`, which turns "must be yours" into "if you
have one, it must be yours". The npm docs say npm never installs an optional peer for you, so a
package can work with a variety of hosts without requiring all of them to be installed.

This is how a library declares a menu. drizzle-orm 0.45.2 lists 28 peer dependencies and marks every
one of them optional: `better-sqlite3`, `pg`, `mysql2` and the rest of the drivers it can talk to.
You install one, and it never installs a database driver on your behalf.

### What each tool does when a peer is not satisfied

Peer resolution is where npm, pnpm and Yarn differ most in what they install and what they say about
it, so each claim here names the tool. Everything on this page was run against pnpm 11.5.0 on Node
24.16.0. pnpm defaults `autoInstallPeers` to true, so it installs any missing non-optional peer for
you, and `strictPeerDependencies` to false, so a mismatch is a warning and the install still
succeeds. It also encodes the peers it resolved into the path on disk, which is how one version of a
package can be installed twice with different peers wired in:

```
node_modules/.pnpm/
  @radix-ui+react-progress@1.1.16_@types+react-dom@18.3.7_@types+react@18.3.31__…
                          ^version  ^the peers this copy was built against
```

## Worked example

This repo has two Reacts. `apps/web` declares `react@^18.3.1`, `packages/workouts` declares
`react@^19.2.0`, and both are installed:

```
$ pnpm why react
react@18.3.1
├── @hone/web@1.0.0 (dependencies)
├─┬ @radix-ui/react-accordion@1.2.20
│ └── @hone/web@1.0.0 (dependencies)
…
```

Eleven of the fifteen `@radix-ui` packages installed here declare react as a peer, and all of them
resolve to `react@18.3.1`, because that is the copy `apps/web` chose. `@radix-ui/react-progress`
asks for `"react": "^16.8 || ^17.0 || ^18.0 || ^19.0 || ^19.0.0-rc"`, which 19.2.8 satisfies. React
19 is right there in the same workspace and no component can reach it, which is the mechanism
working: peers are resolved from the host's context, not from the plugin's. The rest are copies of
`@radix-ui/primitive`, which declares no react peer because it needs no react.

Take the peer away and it stops working. A scratch workspace, a root on react 19.2.8, and a local
`widget` package:

```jsonc
// widget/package.json, first version
{ "dependencies": { "react": "^18.3.1" } }
```

```
root   react -> 19.2.8
widget react -> 18.3.1
same module? false
```

Change the one field, change nothing else:

```jsonc
// widget/package.json, second version
{ "peerDependencies": { "react": ">=18" } }
```

```
Packages: -3
root   react -> 19.2.8
widget react -> 19.2.8
same module? true
```

React's own debugging advice for the invalid hook call warning is this comparison, written by hand:
if it prints `false`, you might have two Reacts.

And here is what a version mismatch looks like when the peer is declared but not satisfied.
`react-dom@18.3.1` declares `"react": "^18.3.1"`; install it beside `react@19.2.8`:

```
$ pnpm install
+ react 19.2.8
+ react-dom 18.3.1
[WARN] Issues with peer dependencies found. Run "pnpm peers check" to list them.
Done in 634ms using pnpm v11.5.0

$ pnpm peers check
✕ unmet peer react
  Installed: 19.2.8
  Wanted:
    ^18.3.1:
      react-dom@18.3.1
```

Exit code 0, both times. pnpm installed the mismatch, pointed react-dom at react 19, and told you
about it in one line you will scroll past.

## Traps

**The unmet-peer warning is usually nothing, which is why it is dangerous.** This repo has one right
now: `eslint-plugin-jsx-a11y@6.10.2` declares `"eslint": "^3 || ^4 || … || ^9"` and this repo runs
eslint 10.8.0. `pnpm peers check` reports it, `pnpm exec eslint --print-config` shows all 34
`jsx-a11y` rules active, and lint passes. The plugin's range is stale, not wrong. Every warning you
correctly ignore trains you to ignore the one that matters, so triage each one when it appears.

**Hooks throw "Invalid hook call" and your code did nothing unusual.** Two copies of React, almost
always because a component library declared react as a dependency instead of a peer, or because a
linked local package brought its own. Check with `pnpm why react` before reading a line of component
code: if two versions come back, that is the bug, and rewriting the component will not fix it.

**The install was clean and the import fails at runtime.** With `autoInstallPeers: false` in pnpm, a
package whose non-optional peer nobody satisfies installs with no warning and exit code 0, and the
first thing to notice is `MODULE_NOT_FOUND` when the code runs. If you would rather find out at
install time, turn on `strictPeerDependencies`, which makes pnpm commands fail on a missing or
invalid peer anywhere in the tree.

**You upgraded the host and a plugin broke without warning anybody.** A plugin that declares no peer
at all is invisible to every peer check there is. It gets whatever the host resolution happens to
give it, or its own bundled copy, and nothing in the install output mentions it. The absence of a
peer declaration is information: it means nobody has thought about which host versions this works
against.

**The peer is satisfied and there are still two copies.** A peer constrains what a package resolves
to, not how many copies exist in the tree. Two applications in one workspace can each satisfy the
same peer with a different version, which is exactly what this repo does with React 18 and React 19.
That is fine until one package imports across the boundary.
[The tree is not the list](./the-tree-is-not-the-list.md) covers the duplication itself.
