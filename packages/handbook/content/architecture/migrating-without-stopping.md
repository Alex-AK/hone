---
title: Migrating without stopping
question: How do you replace something that is still serving traffic, and why is it still ninety percent done a year later?
order: 2
practise:
  - http-deprecation-vs-sunset
  - sys-ratchet-baseline
  - sys-migration-stalled
  - sqlperf-backfill-offset-skips
  - orm-expand-then-contract
  - orders-migration-postgres
sources:
  - author: Microsoft
    title: Strangler Fig pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig
  - author: Martin Fowler
    title: StranglerFigApplication
    url: https://martinfowler.com/bliki/StranglerFigApplication.html
  - author: Will Larson
    title: 'Migrations: the sole scalable fix to tech debt'
    url: https://lethain.com/migrations/
  - author: Refactoring.Guru
    title: What is technical debt?
    url: https://refactoring.guru/refactoring/technical-debt
  - author: ESLint
    title: Command Line Interface Reference
    url: https://eslint.org/docs/latest/use/command-line-interface
verified: 2026-08-09
---

## The model

You do not get to stop. Whatever is being replaced is answering requests this afternoon, so the
replacement has to arrive one slice at a time, with both halves live, and every slice has to be
reversible on its own. That shape has a name and a mechanism.

The mechanism is a facade. Microsoft states it plainly: "A façade (proxy) intercepts requests that
go to the back-end legacy system. The façade routes these requests either to the legacy application
or to the new services." As slices move, the facade shifts more traffic; when nothing depends on the
old system it is decommissioned; and at the end "You remove the façade and reconfigure the client
app to communicate directly with the new system." Fowler's version of why this beats a rewrite is
that a full replacement seems "easy to specify, but often it's hard to figure out the details of
existing behavior."

**The facade is not a rollback plan, it is the absence of a cutover.** A slice is a routing
decision, changeable in both directions, and the blast radius of getting one wrong is that slice.

Larson's playbook for the rest of it has three phases, "Derisk, Enable, and Finish", and the third
is the one every stalled migration is stuck in.

- **Derisk.** "Write a design document and shop it with the teams that you believe will have the
  hardest time migrating." The hardest caller is the one that decides whether the design works, so
  it goes first rather than last.
- **Enable.** "Build tooling to programmatically migrate the easy ninety-percent", then work out the
  self-service tooling and documentation for the rest. Make the tools incremental and reversible.
- **Finish.** Stop the bleeding, generate tracking tickets, push status to the teams that own the
  remainder, and then: "Getting to 100% is going to require the team leading the migration to dig
  into the nooks and crannies themselves."

**"Stop the bleeding" is a ratchet, and a ratchet is not a rule.** A rule the codebase cannot
satisfy today is disabled by lunchtime, because it blocks people whose branch has nothing to do with
it. A ratchet allows exactly what already exists, refuses anything new, and only ever moves down.
ESLint ships the primitive: `--max-warnings` "allows you to specify a warning threshold, which can
be used to force ESLint to exit with an error status if there are too many warning-level rule
violations in your project". Commit the number, and the direction of travel becomes a property of CI
rather than of everyone's good intentions.

**A migration with no number is not a migration.** "380 call sites left" is a thing a burndown can
be run against and a ticket can be cut from. "We're moving to the new client" is an announcement.
This is also the answer to what technical debt actually costs: the metaphor is a loan, where "you
don't just pay off the principal, but also the additional interest", and Larson's claim is about the
only repayment mechanism that scales, that "migrations are the only mechanism to effectively manage
technical debt as your company and code grow". An unfinished one is worse than not starting, because
now you maintain two.

## Worked example

The facade is one decision in one place, and it is data rather than code:

```ts
// Which slices the new service owns. Read from config, so moving one back at
// 3am is a flag flip rather than a deploy.
const MIGRATED = new Set(config.get('orders.migrated')); // ['quote', 'refund']

app.post('/orders/:operation', (req, res, next) =>
  MIGRATED.has(req.params.operation) ? newOrders(req, res, next) : legacyOrders(req, res, next)
);
```

The ratchet is the other half, and it is six lines and a committed number:

```
$ node scripts/ratchet.mjs
legacy-client imports: 374  (baseline 382)   ok, baseline lowered to 374

$ node scripts/ratchet.mjs
legacy-client imports: 375  (baseline 374)   FAIL: this branch added one
```

Nobody is blocked by the 374 that already exist, and nobody can make it 375. The baseline file is
the burndown, in the repository, updated by the machine.

## Traps

**"It's ninety percent done", and it has been for a year.** Nothing prevents a new call site, so the
old thing is still being added while you remove it, and the net movement is a handful. Announcements
do not stop anybody. Two things do: a ratchet in CI, so the number cannot go up, and somebody whose
job is the last stretch. Larson names why the tickets alone are not enough, that "if a team isn't
working on a migration, it's typically because their leadership has not prioritized it", and that
the final ones get done by the team leading the migration rather than by whoever happens to own that
file.

**The rule went on, 412 files failed, and it was off again by lunchtime.** A rule and a ratchet look
like the same commit and behave nothing alike. Turn the rule on as a warning, count the violations,
commit the count, and fail on the count going up. New code lands under the new rule from the first
day, and nobody has to fix somebody else's file to ship theirs.

**The rename shipped as one migration and ninety seconds of 500s followed.** Same shape, one layer
down. Old and new instances serve traffic at the same time during any rolling deploy, so a schema
has to be readable by both: add the new column, write both, backfill, switch reads, then drop.
[Migrations](../orms/migrations.md) owns the sequence and the locks it takes.

**The backfill finished and half the rows were not backfilled.** Copying data while writes continue
is its own failure mode, and the loop that pages with `OFFSET` while its own updates change which
rows match is the standard way to lose half of them silently.
[Backfilling a large table](../databases/backfilling-a-large-table.md) has the measured version.

**Both systems are writing to the same table, and validation passed anyway.** Microsoft lists this
as the first consideration, to "consider how to handle services and data stores that both the new
system and the legacy system might use", and is specific about when the exit closes: you can roll
back while the old tables and the sync still exist, and once they are dropped a rollback means
restoring objects and replaying changes. So removing the old side is "a deliberate final step for
each domain", taken after validation and not as part of the same change.

**You cannot ratchet somebody else's code.** A ratchet works because you own the build. When the
remaining callers are other people's clients, the levers are a date and a header rather than a lint
rule: announce the deprecation, name the day it stops answering, and mean it. This is the one part
of a migration where the finish is scheduled rather than chased.
