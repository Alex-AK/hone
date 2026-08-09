---
title: What a deploy actually is
question: The commit is on main and the pipeline is green. What is supposed to have moved, and why is the bug still there?
order: 1
practise:
  - sys-rollback-kept-the-bug
  - sys-deploy-chunk-404
  - dep-frozen-lockfile-on-deploy
  - orm-expand-then-contract
  - orders-migration-postgres
sources:
  - author: The Twelve-Factor App
    title: 'Build, release, run'
    url: https://12factor.net/build-release-run
  - author: Kubernetes
    title: Deployments
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - author: Docker
    title: docker image pull
    url: https://docs.docker.com/reference/cli/docker/image/pull/
  - author: Vite
    title: Building for Production
    url: https://vite.dev/guide/build
verified: 2026-08-09
---

## The model

"Deploy" is one word for three things, and most deploy surprises are one of the three moving when you
thought another one had. The Twelve-Factor App separates them: "The build stage is a transform which
converts a code repo into an executable bundle known as a build", "The release stage takes the build
produced by the build stage and combines it with the deploy's current config", and "The run stage
(also known as 'runtime') runs the app in the execution environment, by launching some set of the
app's processes."

**The artefact is built once and moved around after that.** A container image, a tarball, a directory
of hashed JavaScript: whatever form it takes, it is the same bytes in staging and in production, or
staging proved nothing. That is also why the identity of an artefact is its content rather than its
name. A tag is a label somebody can point somewhere else tomorrow; a digest is the thing itself,
which is why Docker documents pulling by digest as the immutable identifier and pulling by tag as the
way to get "the most up-to-date version of that image".

**The release is the artefact plus this deploy's config**, and it is what you actually roll back to.
Twelve-Factor is precise about the property that follows: "Every release should always have a unique
release ID, such as a timestamp or an incrementing number. Releases are an append-only ledger and a
release cannot be mutated once it is created." Nothing goes backwards. A rollback is a new release
that happens to name an old build, and it carries today's config, not the config from the day that
build was current.

**The swap runs two versions at the same time.** Unless you stop the service, there is a window where
some instances answer with the old code and some with the new, so every deploy is a compatibility
exercise: a browser can load the new HTML and send its next request to an old instance. Kubernetes
makes the overlap explicit in the rolling update's own parameters, `maxSurge` and `maxUnavailable`,
which are how much extra capacity may exist and how much may be missing during the window.

```
build once, from one commit
  git 4b8e60a  ──build──▶  sha256:9f2c…      nothing environment-specific inside

release = that artefact + this deploy's config
  staging      release 41    sha256:9f2c…    DATABASE_URL=…staging…   LOG_LEVEL=debug
  production   release 118   sha256:9f2c…    DATABASE_URL=…prod…      LOG_LEVEL=info

roll production back
  production   release 119   sha256:1a77…    DATABASE_URL=…prod…      LOG_LEVEL=info
                             ^ the old build   ^ today's config, not the config it shipped with
```

## Worked example

Four instances, one rolling swap, and the part of it that reaches your code:

```
t0    v1  v1  v1  v1                     all four in the pool
t1    v1  v1  v1  v1  [v2 starting]      v2 exists, gets no traffic, fails its readiness check
t2    v1  v1  v1  v1   v2                v2 passes readiness and joins       ── both versions live
t3    v1  v1  v1  --   v2                one v1 leaves the pool and drains   ── both versions live
t4        …repeating…
t5    v2  v2  v2  v2                     the window closes
```

Between t2 and t5, a request can hit either version, and a single user's two requests can hit one
each. So the compatibility rule is the one from
[migrations](../orms/migrations.md), one layer up from the schema: a change to a request shape, a
response shape, a cookie or a queue message is additive until the release that needed it is fully
out, and only then does the old side get deleted.

The other half of the window is the browser, which holds a copy of the old build:

```
09:58   browser loads index.html from v1        →  <script src="/assets/index-a91f2c.js">
10:00   deploy replaces the assets with v2's    →  /assets/index-7d40b8.js
10:03   user clicks a lazy-loaded route         →  GET /assets/Orders-c17e93.js  →  404
```

## Traps

**The rollback deployed yesterday's build and the bug is still there.** Only the build went back. A
release is the build plus the config, and the flag that got flipped, the environment variable that
changed and the queue name that moved are all still on today's values, because "a release cannot be
mutated once it is created" means there is nothing to return to, only a new release to create. Before
rolling back, ask what changed in that window that was not the code, and roll that back separately.

**A tab that was open before the deploy starts failing on a dynamic import.** The browser is holding
the old build's HTML and asking for chunk filenames that no longer exist. Vite states the case
exactly: "a user who visited your site before the new deployment might encounter an import error"
because "the assets running on that user's device are outdated and it tries to import the
corresponding old chunk, which is deleted". Three things fix it and they compose: serve the previous
build's hashed assets for a while rather than deleting them, set `Cache-Control: no-cache` on the
HTML so the next navigation gets the new index, and handle the failure, which Vite gives you as an
event: `window.addEventListener('vite:preloadError', (event) => { window.location.reload() })`.

**"Just redeploy" produced different bytes from the same commit.** If the pipeline builds again rather
than promoting the artefact it already built, the input was not the commit, it was the commit plus
whatever resolved that morning. A floating dependency range or a moving base-image tag is enough on
its own. Build once, promote the digest, and pin the inputs;
[install against CI](../dependencies/install-against-ci.md) is the same argument about the dependency
tree, and it is the half that fails most often.

**The deploy restarted the process and something quietly disappeared.** An in-memory cache, a
`setInterval`, a rate-limit counter, a half-finished upload on local disk. A restart is not an
exceptional event that you handle for crashes: a deploy is a restart, and deploys happen several
times a day. If losing it on a crash would be a bug, you are already losing it every Tuesday
afternoon. What survives has to live somewhere every instance can reach, which is the same conclusion
[load balancers](../systems/load-balancers.md) reaches from the other direction.

**The deploy finished before it was safe to say so.** Green means the new instances started and
passed a check, which is a claim about them and not about the requests in flight on the old ones.
Whether those requests were finished or dropped is decided by the shutdown path, and it is invisible
in the deploy's own output: see [health, readiness, and the deploy that dropped
requests](./health-and-readiness.md).
