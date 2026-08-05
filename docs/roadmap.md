# Roadmap

What is not built. A row leaves this file the day it ships, and nothing here is ever marked done or
struck through: a queue that keeps its own history stops reading as a queue.

Ordered by what a reader is missing while working, not by which section is least complete. The
target is practical knowledge for web engineering and AI engineering, judged against a 15-minute
morning session, and content is never picked to complete a set. Why something was deferred lives in
[decisions.md](./decisions.md); how to write any of it lives in [content.md](./content.md).

## 1. Two writers, one row

Two people open the same record, both save, and the second save throws the first away without
anybody seeing an error. The halves of the answer are already written and the decision between them
is not: `databases/transactions-and-acid.md` owns isolation and `SELECT ... FOR UPDATE`, and
`headers/conditional-requests-and-ranges.md` owns `If-Match` and already notes that lost-update
preconditions have stricter requirements than cache validation. Neither says which one to reach for.

The model is that a read-then-write is not a write, and everything follows from what protects the
gap between the two. Pessimistic locking takes the row and holds it, which is fine inside one request
and useless across a form somebody left open at lunch. Optimistic carries what was read back into the
update, a version column or a timestamp or an ETag, so a stale write matches nothing and lost updates
become zero rows affected, which is a conflict you can actually show somebody. And what to do with
that conflict is a product decision before it is a code one: refuse it, merge it, or take the last
writer on purpose rather than by accident.

It belongs in `databases/`, because the enforcement is in the shape of the `UPDATE` statement, and
the HTTP half is already next door to cite. The reps are `sql` reps, and the easy one is real work
rather than a definition: read an update whose `WHERE` carries the version, and say what zero rows
affected means.

## 2. Which way the system leans

Every mechanism is written down and the axis that chooses between them is not. `replication.md` is
scaling reads, `sharding-and-partitioning.md` is scaling writes, `what-an-index-costs.md` is the tax
reads charge writes, `caching-patterns.md` is who fills the cache, and `scaling-up-and-out.md` is
what has to leave the process first. What no page says is that the ratio decides which of those is
even relevant, and that the answer is usually one number nobody has measured.

The inference is the content: a read replica does nothing for a write problem, and an index that
fixed the page slowed the nightly import. It fills a traps section honestly, which is the test that
decides whether this is a page at all: the replica bought for the wrong bottleneck, the index that
moved the cost somewhere nobody was watching, and the ratio measured off page views when every view
writes an analytics row.

The risk is worth writing down too, because this is a connective page rather than new material, and
that is the shape most likely to come out a survey. If it cannot be written without restating the
five pages above, it is not a page, and the honest outcome is a paragraph added to
`scaling-up-and-out.md` instead. It lives in `systems/`, and the reps exist already:
`sys-cache-aside-vs-write-through` and `sql-index-unused-cost` are both this decision seen from one
end.

## 3. Operating a model dependency over time

Two pages, both about the half of the AI section that is not one request. The section covers what a
call costs, what comes back and what you do with it; nothing covers living with the dependency for a
year.

**Prompt caching, and what invalidates it.** `what-inference-costs.md` already leans on this without
owning it: it prices a cache write at 1.25 times base input and a read at a tenth, and says caching
is usually what tips a long-prompt call from input-heavy to output-heavy. What no page says is that a
cache is a prefix match, so any byte that changes before the breakpoint invalidates everything after
it. The model to write down is that render order is tools, then system, then messages, which makes
the cheap mistakes structural rather than careless: a timestamp interpolated into the system prompt,
a tool list built by iterating an object, a session id in the preamble. It is checkable against the
`usage` fields on every response, which is the kind of claim this section is built on. A page leaning
on a mechanism nobody explains is the same signal that put the bundler in Deferred; the difference is
that the reps here write themselves, because "which of these three edits invalidated the cache" is a
real question with a definite answer rather than a definition. No rep in `ai-engineering` mentions
caching today, so the page arrives with two or three of its own.

**Upgrading the model.** A model upgrade is a dependency upgrade with no lockfile and no semver.
An alias moves under you, a pinned id is retired on a date somebody else picked, and the behaviour
change that arrives passes every type check you have: shorter answers, a different refusal boundary,
a tool called half as often. The eval suite is the only regression gate, which is `evals-as-tests.md`
read from the other end, and rollback is the part people discover late, because the version you want
back may no longer be served. This joins two sections that already exist rather than opening one, and
`dependencies/updating-a-dependency.md` is the page it should argue with.

## 4. The rest of the decks

Two decks suggest themselves and cannot be written, both for the same reason: `page` is mandatory and
neither has one. No page owns the redirect codes, 301 against 302 against 307 against 308. Time
formats are a module rather than a page, because there was no model there to write down. A deck is
not on its own a reason to write a page, so both wait until something else asks for one.

**That wait is how a deck is meant to arrive, and there are three worked examples now.**
`four-ways-to-run-it-later` could not be written yesterday and needed no argument today, because a
page about `nextTick` and `setImmediate` was written for reps that wanted it, and the contrast set
was sitting inside the page once it existed. `three-promises-that-sound-alike` and
`embed-or-reference` arrived the same day as the pages they cite, and neither was the reason those
pages exist. So the rule holds in both directions: a deck does not justify a page, and a new page is
worth re-reading for the contrast set it just made checkable.

`packages/decks/content/` is the inventory, and a deck named there and not on disk is a name that
changed, not a deck that is missing.

## 5. Sections with no practice behind them yet

These are last because nothing in the problem set is waiting on them.

**Isolation: sandboxes, containers and virtual machines.** What actually contains code you do not
trust, and what only looks like it does. This project is its own worked example, which is the reason
the section is worth writing rather than reading elsewhere: the workout runner executes submitted
code, [decisions.md](./decisions.md) records `node:vm` as an isolation convenience and not a security
boundary, and self-hosting was declined on exactly that ground. Pages: what a process already gives
you and what it does not; what a container is made of, which is namespaces and cgroups over a kernel
everything still shares; where a virtual machine draws the line instead, and what that costs; microVMs,
and why the people running other people's code ended up there; and running code a model wrote, which
is the case a web engineer now actually meets. That last one is a gap inside a section that already
ships: the AI engineering pages now cover running what a model asked for and treating what comes
back as untrusted, and still say nothing about running code it wrote. Distinct from production
below, which owns the image as a packaging and deploy concern: this section owns isolation as a
security property. Credits: the Docker and Firecracker docs, the Linux man pages, `node:vm`'s own
documented warning.

**Unix, at the level a web engineer meets it.** Not a shell course and not systems administration:
the handful of operating-system facts that decide how a Node process behaves once it is not on your
laptop. Pages: your server is a process, with an environment, a working directory, a parent and a set
of file descriptors; standard output and standard error are two streams, which is why logs go to
stdout and why a progress bar does not; signals, and the `SIGTERM` a platform sends before it stops
waiting, which is the whole of graceful shutdown; exit codes, including what a non-zero one does
inside a pipeline; permissions and ownership, and why the container does not run as root; and the
path, environment and quoting rules that make a command behave one way in CI and another on a laptop.
The overlap with production is signals, and the split is that production owns the deploy sequence
while this section owns what the signal is. Credits: the Linux man pages, the POSIX specification,
Node's `process` documentation.

**Running it in production.** Each page answers what changes about your code when it stops being a
process on your laptop, which is the part a web engineer owns rather than a cloud certification.
Pages: what a deploy actually is (artefact, config, and the swap); processes, containers and what
the image is really doing; configuration and secrets, and where the environment stops being enough;
health, readiness and the difference; logs, metrics and traces, and the cardinality trap. Credits:
the Twelve-Factor App, the Docker and Kubernetes docs, OpenTelemetry.

**One bullet left this section rather than the section shipping**, and it is the first of these four
to lose ground to work done elsewhere. "Zero-downtime releases and the migration that has to go
first" is now `orms/migrations.md`, which owns the deploy-ordering half down to the three-deploy
expand-then-contract, and it has `orders-migration-postgres` and two reps behind it. Worth reading
before writing the deploy page, because the remaining question there is the artefact and the swap
rather than the schema.

**Trade-offs and architecture**, last of all, because it resists the page shape: trade-off thinking
is learned in retrospectives, not reference pages. Four pages that can fill a traps section
honestly: monolith, modules, services (when each is the right call); migrating without stopping
(strangler fig, and holding the line with ratchet tooling); prudent against reckless technical debt;
and the dependency behind a port you own, with Redis as the worked example, since the workouts
already ship a fake one with a clock. The architecture reading list becomes this section's
further-reading shelf, every book credited. Credits: refactoring.guru, Microsoft's strangler-fig
page, Will Larson's migrations essay, the listed books.

## The last pass, and what finishing means

The five sections above are the whole content queue, and it is meant to run out. An empty roadmap is
the intended end of this project rather than a failure to think of more work: the subject is
practical knowledge for web engineering and AI engineering judged against a 15-minute morning, and
that is a finite thing to cover. Everything past it is maintenance, which is a page going stale or a
new API worth knowing, and neither is a queue.

**One pass is deliberately held until then: reading every page's practise list against the whole
problem set at once.** Twenty-nine easy reps are cited by no page. Six of them are `query-params`
reps, which is the case that produced a module rather than a page and is a reminder that "uncited"
is not the same as "missing something". It is tempting to do that pass now and it would be the wrong
order, because every section still to be written arrives with its own reps and moves the answer.
Doing it once at the end costs less than doing it three times.

What that pass is, when it comes: every uncited rep offered to the pages it actually serves, each
section's `order` re-read now that the section is whole, and the pairing rule checked in the
direction nothing enforces, which is practice volume with no page behind it. It is one sitting over
finished content, not a rolling chore.

## Platform

Content is the product, so this stays short. All of it is workout depth.

- **Attempt history per workout**: second and third runs are the point, so the UI should show the
  trend in time-to-green.
- **Multi-file tree** rather than a flat tab list. **The condition it was waiting on has been met**:
  `session-revocation-nestjs` ships eight files under `files/`, and a flat tab list stops being
  readable somewhere around there. This is now the platform row with an actual workout behind it.

## Deferred

Listed so they are decisions rather than oversights. The arguments live in
[decisions.md](./decisions.md).

- **The other six modules** — `promises`, `json`, `js-errors`, `regex`, `tokens-and-crypto`,
  `node-fs` — until a rep or a page asks for one. They sat in the queue for a long time under a
  preamble that argued against writing them, which is a refusal wearing a queue's clothes: the entry
  said in its own words that they were a list of APIs, where `url-and-searchparams` had ten uncited
  `query-params` reps behind it. Two modules is not a gap, and ADR-0091 is the sharpest evidence:
  building the async hour on the essentials path wanted no API taught from scratch, which by the
  module spec's own criterion demotes `promises`. Note which way that evidence runs — authoring a
  path can demote a module and never promote one.
- **The systems case-study shelf**, which is curated further reading rather than pages. It survived
  every reordering of the queue by blocking nothing, which is the tell: a row that is never the next
  thing to do is not queued, it is declined. Revisit if the systems section is ever read and found
  to end where the reader wanted a worked example.
- **A testing handbook section**, until the category grows past the JavaScript section's size or a
  workout's checkpoints are about the tests themselves. Currently level rather than past: nine
  `testing` reps against nine `javascript` pages, so the next few reps decide it.
- **Mongo and Mongoose**, until a brief needs a document store. Needing a daemon is no longer the
  reason: a workout may declare one in `requires` and skips cleanly where it is absent. What is left
  is the ordinary bar, which is a lesson that cannot be taught without it.
- **What the bundler does**, until a page needs it as more than a passing reference or reps arrive
  that want it. Two pages already lean on the bundle existing without explaining it,
  `security/secrets-and-the-bundle` and `react/code-splitting`, and the territory is real: why one
  import pulls in a library, why a dynamic import did not split, what a source map gives away. It is
  deferred rather than queued because nothing practises it today, and a page whose reps have to be
  invented alongside it is the shape that produces trivia. Those two pages leaning on it is the
  signal to watch, not a third one doing the same.
- **Git**, which is daily and still declined. The graders have no shape for a merge conflict or a
  rebase, the knowledge is muscle memory rather than a model that people get wrong, and a page on it
  would restate documentation the reader can already reach. Recorded because its absence is
  conspicuous enough to look like an oversight.
- **A FastAPI workout**, which would put a Python runtime in the workout runner.
- **React Native and desktop**, until the web map is substantially built.
- **Interactive diagrams**, which are application code per diagram.
- **A weekly long-session preset**, superseded by the essentials path, which has shipped. The preset
  was a longer daily queue; a curated order is the better answer, and it does not wait on whether
  workouts fit a morning, because it is explicitly not a morning session.
- **Progress tracking on modules**, including whether a failed prediction should schedule a review.
  That is a migration, and it waits for real data.
- **A schedule on cards**, which is the same migration and a weaker signal, since a self-graded card
  produces an opinion rather than a verdict. Revisit after a few weeks of using a deck, when you can
  either name the cards you keep missing or are annoyed that the app cannot.
