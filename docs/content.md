# Writing content

Hone has five content types: problems, handbook pages, workouts, modules and decks. This is the
bar each one clears and how to write one. Read the section for the type you are adding, then the
cross-cutting rules at the end, which apply to all five.

A sixth kind of file authors nothing and orders what the others produce: a session on the essentials
path. Its section is below, and its bar is different because its material is already written.

What this file does not cover: `WRITING.md` owns the prose and is not optional reading, `CLAUDE.md`
owns the commands and the constraints of the codebase, `docs/decisions.md` owns why a rule is the
way it is, and `docs/roadmap.md` owns what is not written yet.

Content is a directory or a seed-file entry, never application code. If adding a piece of content
needs an application change, that is a bug in the design and worth saying out loud before you work
around it.

## Problems

A problem is one rep. Sixty to ninety seconds, answered by someone who already knows the concept,
scheduled by the review ladder. It measures recall.

### Where it lives

Content is `apps/server/src/seed/problems/<category>.ts`, one file per category. Problems upsert by
slug, so editing one updates it in place and keeps its attempt history. `position` is generated in
`problems.seed.ts` at seed time, never authored. Run `pnpm seed` after editing: boot only auto-seeds
an empty database.

A category is a member of `CATEGORIES` in `packages/shared/src/index.ts` with a label in
`CATEGORY_LABELS` and a seed file of its own. Adding one is those three things and nothing else, and
the suite refuses a category with no reps behind it.

A fourth line is available and has one member: `OPT_IN_CATEGORIES` takes a category out of the daily
round robin, so it is dealt only to somebody who scoped practice or a session to it. That is for a
separate track like `dsa-patterns`, not for material somebody should meet in the morning, and the
bar is whether a rep landing unannounced in a 15-minute session would be a misfire. It holds back
only what you have never touched: attempt or skip one of its reps and the queue treats it normally
from then on.

### The two axes

`difficulty` is how hard the answer is. `relevance` is how often the knowledge comes up, and they
are independent:

- `daily` — you write this in ordinary feature work.
- `occasional` — it comes up in a bug, a perf pass, an edge case.
- `foundational` — you meet it through a framework more often than you write it.

Author `relevance` honestly. A hard problem can be daily bread and an easy one can be pure trivia,
and the label is what lets a 15-minute session be judged on what it is actually teaching.
`foundational` is not an insult.

**An easy problem is a real thing met in ordinary feature work, answered in under two minutes by
someone who has just read the page.** A definition to recall is not one. If the only easy rep you
can think of for a topic is "what is this called", the topic has no easy rep, and writing the rep
anyway teaches that the definition was the point. Where the definition is genuinely worth knowing
cold, it is a card in a deck, which is entered on purpose rather than dealt to a morning.

### The third axis, which is usually absent

`tags` is optional and almost always empty. A tag cuts across categories, which is the one thing a
category cannot do, and it exists so a posture can be practised on purpose: `/practice?tag=reading`,
or a session scoped to it. The bar is whether somebody would deliberately spend fifteen minutes on
it. If nobody would, the rep's category already says enough and the tag is keywording.

A tag does not change the morning. The unscoped queue keeps dealing tagged reps in their categories,
because interleaving is what retention wants, and the tag is only how you enter the material on
purpose. The suite refuses a tag with no reps behind it, and refuses one whose reps all sit in a
single category, since that tag is a category wearing the wrong hat.

**Writing a `reading` rep.** It hands you unfamiliar code and asks what it does. Four question shapes
carry it: what does this print, where the answer turns on evaluation order, closure capture or async
scheduling; what does this function do, in one sentence, which is really about naming intent; what
breaks when the input is empty, `null`, or very large; and which line is the one that matters, over a
snippet where most of them are noise.

The authoring discipline is the hard part. The snippet has to be idiomatic code somebody would really
ship rather than a puzzle written to have a surprising answer, and the question has to be answerable
without being a definition. A reading rep that rewards spotting a trick teaches trick-spotting. Run
every snippet before it ships: the empty `IN ()` list that reads like a syntax error on both engines
is a syntax error on Postgres and zero rows on SQLite, and only running it says so.

Not to be confused with a module, which also predicts before it runs. A module walks you through an
API you are being taught and settles the prediction by running it. A reading rep is the opposite
posture: unfamiliar code, no run, and a grader.

### Picking a grader

Five types, and the choice is made by what the answer is, not by the topic:

- **`sql`** — the answer is a query. Config is `{ solutionSql, orderMatters, hints }`. Expected rows
  are produced by running `solutionSql` at grade time against `practice.db`, so the dataset can grow
  without invalidating anything. Rows compare by value rather than by column name, so aliases never
  matter. Set `orderMatters` only when the prompt asks for an order; when it is set, right rows in
  the wrong order grade `close`.
- **`short-text`** — the answer is a name or a one-line expression. Config is
  `{ accept, acceptPatterns?, nearMisses?, closeSubstrings?, hints }`. Both sides are normalised
  (case, whitespace, wrapping quotes and backticks, trailing punctuation), and accept strings of six
  characters or more get typo tolerance for free. Use `acceptPatterns` when the shape matters more
  than the exact text.
- **`explain`** — the answer is a sentence or two. Config is
  `{ groups: [{ synonyms, missingFeedback }], hints }`. A group matches when any synonym appears in
  the normalised answer; all groups is `correct`, half is `close`. Each group is one idea you
  require, so three groups is the practical ceiling.
- **`js-code`** — the answer is a function. Config is `{ setup?, starter, tests, hints }`.
- **`ts-type`** — the answer is a type. Same config shape as `js-code`, and nothing runs: the
  submission is type-checked and the checks are made against the type the checker inferred.

**Name the obvious wrong answer.** `nearMisses` and `closeSubstrings` map a specific wrong answer to
specific feedback and grade it `close`, which is where most of the teaching in a short-text problem
actually happens. `filter` when the answer is `find` deserves a sentence, not a red banner.

Hints are ordered mildest to strongest, and one more is revealed on each failed attempt, so hint one
should not name the answer. `pnpm grade <slug> "<answer>"` prints the verdict alongside the exact
config it was measured against, which is the fastest way to find out whether a grader is too strict.

### js-code specifics

**A test takes an `expression`, not statements.** It is evaluated after the submission runs, so
multi-step setup has to be wrapped in an IIFE. A test is
`{ name, expression, expected | expectedCode | throws }`:

- `expected` is deep-compared and has to be JSON-serialisable.
- `expectedCode` is an expression, for the values JSON cannot hold: `undefined`, `NaN`, a `Map`.
- `throws` matches a substring of the thrown message.

`name` is shown to the user, so phrase it as the behaviour being checked. `starter` is prefilled
into the editor and must carry the signature, so the name the tests call is the name the user sees.
The reference implementation doubles as the canonical answer and the displayed solution, which is
what stops those two drifting apart.

### ts-type specifics

`ts-type` is for the questions the other four can only ask *about*: conditional types, `infer`,
mapped types, template literal types, assertion functions, what `satisfies` preserves. A rep about
one of those written as `short-text` grades the spelling of an answer rather than the answer, which
is why `` `${string}:${infer Name}` `` and `` `${infer Prefix}:${infer Name}` `` both pass here and
only one of them would survive an `acceptPattern`.

The config mirrors `js-code`: `{ setup?, starter, tests, hints }`. `setup` is the declarations the
answer builds on, in scope before it and shown read-only above the editor. `starter` carries the
name the checks use, and the reference doubles as the canonical answer and the displayed solution.

A check is `{ name }` plus **exactly one** of three assertion forms, and the parser refuses two:

- `type` + `equals` — what the answer's type for `type` must be. Compared for **identity**, not
  assignability, because `A extends B` and `B extends A` both holding is a weaker claim than
  sameness: `any` satisfies it against everything, and so does a mapped type that dropped a
  `readonly`. Those two land as `close`, which is the near-miss handling this type has instead of
  `nearMisses`.
- `compiles` — statements that must be accepted, written as if inside a function body. This is the
  only way to observe narrowing, since a narrowed type has no name to assert on.
- `rejects` — statements the checker must refuse, with an optional `errorCode`. Pair it with a
  `compiles` check whenever the answer could pass by widening: `asserts value is any` satisfies
  every `compiles` check there is.

Three things to know before authoring one. The submission is checked against the strictness in
`tsconfig.base.json`, so a rep cannot depend on a looser flag. The library is ES2022 and nothing
else: no DOM, no Node types, and no imports, for the same reason the code runner's realm is bare.
And a type error anywhere in the answer means no check runs, so the feedback is the compiler error
against the user's own line numbers.

**Declarations go in `setup`, never in a snippet.** A `compiles` or `rejects` snippet is compiled
inside a function body, which is what gives narrowing somewhere to happen and keeps one probe's names
out of the next one's scope. `declare const x: T` is illegal there and fails with TS1184, which used
to make the surrounding `rejects` check pass for the wrong reason.

**`satisfies` cannot be observed by a check, so do not design a rep around proving one is present.**
It never changes the resulting type: either the value conforms, and the type is what `as const` alone
would have given, or it does not, and the submission simply fails to compile. A rep can still teach
it by what the *alternatives* cost, which is what `ts-as-const-satisfies` does — the annotation
answer fails all three checks and `satisfies` without `as const` fails two.

**Write a `rejects` check that could only fail for the reason you mean.** The grader refuses a
rejection whose diagnostic is "cannot find name", because that means the answer never declared the
thing the check refers to and the snippet was refused for not existing rather than for being wrong.
Pinning `errorCode` is the sharper version of the same discipline and is worth doing anyway.

### The rest of a problem

`prompt` is markdown and states the task. `solution` is the canonical answer as a user would type
it. `explanation` is the lesson, read in the thirty seconds after solving, and it carries the
teaching on its own: most reps need nothing behind them at all. Two to five sentences of why, not a
restatement of the prompt.

### What the suite enforces

Every canonical answer grades `correct`, every declared near-miss grades `close`, every
`acceptPattern` compiles, no keyword synonym normalises to an empty string, every tag is a known one
with reps behind it in more than one category, and every coding and type problem's reference passes
its own tests while its starter does not. That is what makes problem content safe to edit in volume,
and it runs in `pnpm verify`.

## Handbook pages

A page is not an article. It is what you would want open beside you while doing the workout.

### The shape

Five parts, fixed:

1. **The question it answers**, phrased the way you would ask it at the moment you needed it. "Why
   did my cache not invalidate" beats "Cache invalidation". This is the `question` field.
2. **The model** — what is actually happening, not the API surface. `## The model`.
3. **A worked example** you can read in under a minute. Real code, ideally lifted straight out of a
   workout so the two reinforce each other. `## Worked example`.
4. **The traps** — the two or three things that actually get got wrong, stated as symptoms first,
   because that is how you meet them. `## Traps`.
5. **Where to practise it** — the `practise` field, resolved by the app into links.

The three body headings are checked by exact text. Write whatever else you need around them.

**A page that cannot fill its traps section honestly does not get written.** If nothing goes wrong
in practice, the thing is a fact you would look up, and a fact you would look up is a problem, not a
page. What earns a page is the model that several reps share, where getting that model wrong is what
makes all of them fail.

### Where it lives

`packages/handbook/content/<section>/<slug>.md`, alongside a `section.json` carrying the section's
`slug`, `title`, `summary` and `order`. The server reads the directory per request, so a new page
needs no restart. Pages are written to read fine as plain markdown on GitHub; the app adds section
navigation and resolves the `practise` links.

Frontmatter:

- `title` and `question`.
- `order` places the page in its section. Pages without one sort last.
- `practise` takes problem and workout slugs, mixed. Every one must resolve.
- `sources` takes an author, a title and a canonical URL each. At least one, always.
- `verified` is the date, `YYYY-MM-DD`, the page's claims were last checked against those sources.
  It is shown on the page. Move it when you have actually rechecked, not when you touch the file.

The frontmatter parser takes a small YAML subset: strings, lists of strings, and lists of flat
objects. Quote a value containing a colon followed by a space.

### The safety net

`pnpm verify` refuses a page that cites nothing, cites through a link shortener, points `practise`
at a slug that does not exist, has an unparseable `verified` date, or is missing part of the shape.
The rest of the citation policy is review's job, and it is at the end of this file.

### Engine honesty

The pages teach Postgres in places; the app runs SQLite and PGlite. Say which engine a page means,
and note where SQLite differs (no `ILIKE`, different `EXPLAIN` output). **Run the query.** Numbers
and behaviours on a page about a language with an engine underneath are produced by running it
against `practice.db`, not recalled: three claims that would otherwise have shipped as fact were
wrong the first time this rule was applied.

### Diagrams

Some material is a diagram or it is nothing. **Fenced ASCII is the floor**, it costs nothing, and it
works better than it sounds. Anything richer is a dependency decision that lands in the app bundle,
so it gets made deliberately and not inside a page. Interactive diagrams are out: a diagram you can
drag a node around in is application code per diagram, which breaks the rule the whole library rests
on.

### Before you write one

Grep `packages/handbook/content` first. Topic requests arrive as lists and a list does not know what
already exists; if a page covers the concept, the item is an edit to that page or it is nothing. A
page that covers the concept but never says the word someone came looking for is a real gap inside a
covered topic, and that earns its own page.

## Workouts

A workout is 12 to 25 minutes against a real toolchain: read a brief, edit real files, run
checkpoints, see how far you got. It measures execution under time.

### The shape

A directory under `packages/workouts/content/<slug>/`, and adding one touches no application source:

```
workout.json                 manifest
brief.md                     the task, written like a ticket
files/                       the starting project, what you edit
tests/checkpoints/*.test.ts  one suite per checkpoint, hidden from the editor
solution/                    the reference implementation of the editable files
```

`pnpm workout <slug> [--stack node|express|nestjs|react] [--file <name>] [--requires <need>]
[checkpoint …]` emits that skeleton, so the parts every workout shares are right before you start:
the numbering that has to match manifest order, the `solution/` that has to mirror `editable`, and
the supertest binding that has bitten twice. It templates nothing that varies, because a guessed
`db.ts` reads as a decision somebody made. **A fresh scaffold fails its own spec until you write it**, and that is deliberate:
its solution is its starter, so the safety net says so rather than going quiet on an empty workout.

The manifest carries `slug`, `title`, `kind` (`feature`, `bug-hunt` or `refactor`), `minutes`,
`difficulty`, `relevance`, `summary`, `focus`, `editable`, `checkpoints`, and a free-text `stack`
(`server`, `orm`, `database`, `client`). Stack is free text on purpose: the same brief can ship
against four ORMs as four workouts, and practising against a stack you do not know is the thing that
pays off.

A workout that needs a library the others do not use adds it to `packages/workouts/package.json`.
Each workspace symlinks its `node_modules` there, which is how a workout imports the real
drizzle-orm with no install and no network. That line is the one part of a workout that is not just
a directory, so adding it stays a decision rather than a reflex.

### Configuring the test run

Almost no workout needs this. The scaffold's vitest config decides how a suite runs, and a workout
cannot replace it. What a workout may do is declare an optional `testRun` in the manifest, which the
runner translates onto the process the suites run in:

```json
"testRun": {
  "timezone": "America/New_York",
  "setupFile": "tests/setup.ts"
}
```

**`timezone`** is an IANA zone applied as `TZ`, and it is the only way to fix the zone a workout's
suites run in. A fake clock moves `now` without moving the zone, so a workout about a DST boundary
needs it and cannot get there by writing assertions more carefully. Spell the zone canonically:
`TZ` matches the zone database as spelled where `Intl` does not, so `America/New_york` produces a
fixed offset with no DST transition and quietly deletes the boundary. The loader refuses that
spelling rather than let it through.

**Check the pin is load-bearing before you trust it.** Nothing tells you whether a declared zone is
doing anything: a workout can name one, pass everywhere, and be declaring it for nothing, because a
suite written to be fully zone-explicit does not care either way. The check is manual and takes a
minute. Strip the field, set `TZ` to somewhere far away in your own shell, and run the suites. If
they still pass, the pin was decoration and the workout is not about a zone. `booking-times-node`
was the first workout to use this, and stripping the field there fails three checkpoints of four.

**`setupFile`** names one file under the workout's own `tests/`, run before every suite in both
projects. It is for registering a global the environment does not have: `ResizeObserver`,
`IntersectionObserver`, `matchMedia`. Assign to `globalThis` rather than to `window`, because the
same file also runs in front of the node suites. Do not use it for fixtures or shared helpers, which
belong in `tests/support/` and get imported by the suites that want them.

Both fields are optional and both default to nothing. Everything that decides whether a checkpoint
can fail stays out of reach: `include`, the timeouts, the reporter. A workout that could set those
could pass its own suite by configuring the failure away.

### Checkpoints

A checkpoint is one test file, and its status is "did every assertion in that file pass". That is
what makes an unfinished attempt worth something: at ten minutes you can see two of four green. Each
checkpoint has an `id`, a `title` phrased as the behaviour being checked, its `testFile`, and a
`hint` shown only after it fails.

Checkpoints are ordered but independent: checkpoint four can pass while one fails.

**A checkpoint may generate its own inputs**, which is worth reaching for when the contract is "for
any input" rather than "for these inputs". Two workouts do it and they take the two available shapes.
`json-parser` has an oracle, so the check is agreement: generate a document, run `JSON.parse` over
the same text, and fail where one of them accepts what the other refuses (ADR-0165). Nothing else has
an oracle, so `circuit-breaker-node` checks invariants instead: generate a schedule of calls and clock
movements, record what happened, and read the rules off that trace (ADR-0166). **Reimplementing the
thing in the suite is neither of these and is not the third option**, since a model has to be kept in
step with the brief and can be wrong in the same way a submission is.

Five rules come with either shape.

- **Seed everything.** A checkpoint that fails one run in five is worse than no checkpoint.
- **Assert the refusals**, not only the answers. Accepting what should be rejected is the half
  hand-written examples cover worst, and on both workouts it is where the unique catches came from.
- **Write the liveness rules as well as the safety ones.** "Nothing may happen before it is allowed"
  cannot see a state machine that acts too late, and half the planted bugs in the breaker were late
  rather than early.
- **Shrink before reporting.** The counterexample that is found is long; the one worth printing is
  the shortest that still fails, and it doubles as a test case to paste somewhere.
- **Check nothing the brief has not already stated.** Otherwise it is a gotcha rather than a stricter
  reading of the same task, and say in the brief that the checkpoint exists and what it prints.

Budget the runtime deliberately. The breaker's generated checkpoint costs ten times its other four
together, so scenario counts get tuned down until they fit rather than set to whatever felt thorough.

**A suite that drives HTTP hands supertest a listening server, not an app.** `request(app)` binds a
fresh ephemeral port on every call, so a suite that loops requests (ten revalidations, one per unit
of rate-limit allowance) opens a socket per assertion. That passes alone and fails under the parallel
load of `pnpm verify`, as `socket hang up`, on a different checkpoint each run, which is the most
expensive kind of failure to diagnose because it never reproduces where you are looking. Bind once in
`beforeEach` (`server = app.listen(0)`), close in `afterEach`, and pass `server` to supertest. Keep
the `app` binding too if an assertion reads `app.locals`.

### Showing what the code produced

A checkpoint answers yes or no, and for most of the set that is the whole feedback and it is enough.
Where it is thin is the checkpoint whose subject is a shape: the JSON body an endpoint answered with,
the rows a page of a query held, the markup a component rendered. There the verdict names a path like
`columns.0.cards.3.updatedAt` into something the reader cannot look at.

A suite may hand one of those over:

```ts
import { record } from '../../hone/record';

record('one card, exactly as it was sent', columns[0].cards[0]);
```

It lands in a panel beside that checkpoint's verdict. A string is printed as it arrives, which is how
`prettyDOM` output and a failure message get there; anything else is JSON, pretty-printed, cut at
4,000 characters. Recording cannot decide anything: every error inside it is swallowed, so a
checkpoint ends exactly where it would have ended without the call.

Three rules.

- **Record the exhibit, not the haystack.** Whole payloads are scrolling. `support-board-express`
  records the board's skeleton and one card, because one card is where every field in the contract is
  visible at once, and the whole board is 94 tickets.
- **Once per suite.** Three tests fetching the same board is one exhibit, not three.
- **Most checkpoints record nothing.** This is for the ones whose subject is a shape, and a workout
  with no such checkpoint gets no panel. Reach for it where a verdict names a path into something
  invisible, not to narrate a run.

**It is a transcript, not a preview.** What goes in is text a suite already produced, and what comes
out is text in a panel. Rendering a live component in an iframe is a second runtime, and it is
refused: see the roadmap's Platform section.

### The brief

**A brief states the symptom and the requirement, never the cause.** Working out what is wrong is
the exercise, and by the time you write the brief you know the answer, which is what makes this the
easiest mistake in the repo to make. It applies to `brief.md` and to the manifest's `summary`, which
is read first and leaks the answer most easily. `WRITING.md` has the worked before and after.

Three things stay explicit, because they are the task rather than the answer:

- **What must still be true when you are done.** Unchanged output, no new dependencies, the same
  API.
- **Anything unguessable about the environment.** A fake's odd semantics, where the query log is,
  what `advanceTime` does. Withholding local trivia is a scavenger hunt, not difficulty.
- **Checkpoint hints**, which appear only after that checkpoint has failed. That is the moment to be
  specific: name the one thing that is wrong.

### Two sizes

**Easy is a shape, not a smaller medium: twelve minutes, three checkpoints, one editable file, one
concept.** The starter compiles and runs, so the twelve minutes go on the lesson rather than on
wiring. A medium workout asks you to build a thing; an easy one asks you to get one thing right, and
runs twenty minutes or more.

**An easy workout still needs one checkpoint that cannot be patched locally**, or it teaches
nothing. Two symptoms that can each be fixed where they appear plus one that forces the actual fix
is the pattern that works.

**Check the scaffold for accidental help.** Express's built-in ETag handling would have handed over
two of three checkpoints in a conditional-requests workout for free; it is turned off, with a
comment saying why. Whatever the framework does helpfully by default is worth a minute of looking
before you trust a checkpoint.

### Judging behaviour, not wall-clock time

A timed assertion is flaky, so a performance workout asserts on what the code asked the database
for: statement counts, rows returned, and `EXPLAIN` of the query actually sent. That makes the
failure message the teaching ("one query came back with 40000 rows for a page of 20"), and it
distinguishes an index that exists from an index the planner chooses. Anything time-based gets a
fake clock the real dependency does not have, not vitest's fake timers, which fight supertest's
sockets and `userEvent`.

Nothing reaches the network, ever. No live API, no key, nothing fetched at attempt time. Fixtures,
in-repo fakes with the real surface and the awkward semantics kept, and WASM databases. The awkward
semantics are usually the lesson.

**A local process is not the network.** Seven workouts bind `app.listen(0)` and drive it with
supertest, and a workout may require a binary this repo does not ship when the lesson needs one: a
real Postgres for two connections and a lock somebody can wait on, a document store, a queue. That is
a decision rather than a reflex, the same as any dependency, and the bar is that the lesson cannot be
taught without it. **Declare it, and it degrades rather than fails.** Reach for a fake first, because
a fake you drive is more deterministic than a daemon you wait for, and the awkward semantics you
would have to keep are usually the lesson anyway.

### Requiring something this repo does not ship

A workout that needs one declares it in the manifest, as `requires`:

```json
"requires": [
  {
    "port": 5432,
    "install": "brew install postgresql@17 && brew services start postgresql@17",
    "reason": "Two connections and a row lock one of them waits on."
  }
]
```

**A requirement names a `binary`, a `port`, or both, and the loader refuses one naming neither.**
Which of the three is a question about the dependency rather than about taste. A command line tool
you shell out to is a binary. **A daemon you connect to is a port**, and usually only a port: what a
workout reaching Postgres over TCP needs is something speaking the protocol on 5432, and `postgres`
on `PATH` is neither necessary nor sufficient, since Postgres.app and a container both serve the port
without it. Name both only when the workout genuinely uses both, because both are then checked and
either one missing skips the workout.

**`binary`** is a bare name looked up on `PATH`, never a path: a path would resolve against the repo
and declare a requirement that is met whatever the machine has. **`port`** is checked on `127.0.0.1`,
and it is also the port the suites are handed, which is the next section. **`install`** is the line
the reader runs, and it covers starting the thing as well as installing it. **`reason`** is what the
workout does with it that a fake could not, which is the bar the requirement had to clear in the
first place.

Three states, three sentences, because a reader can only act on the one they are in: not on `PATH`
("install it"), on `PATH` with nothing answering the port ("start it"), and a port nothing answers
where no binary was named. The third says nothing about `PATH`, deliberately: telling somebody whose
Postgres runs in a container to install it would send them after a second copy of what they are
already running.

`pnpm workout --requires postgres:5432` scaffolds the block, and `--requires 5432` or
`--requires postgres` scaffold the one-sided versions. The flag is opt-in and the field is emitted
only when it is passed, because unlike `kind` or `minutes` the usual answer here is "nothing", and
leaving the field out is how a manifest says that. `install` and `reason` come out as TODOs.

Absence is not failure anywhere. The runner returns before vitest is spawned, with every checkpoint
not-run and a `skipped` line naming what is missing; `GET /api/workouts/<slug>` carries the same
thing as `unmet`, so the page says what to install instead of offering a clock; starting a workout
that cannot run is a 409, so no attempt row and no workspace are created; and `workouts.spec.ts`
skips that workout's two tests with the missing thing named, rather than turning `pnpm verify` red on
a laptop with no Postgres.

None of that can hide a failure. What is skipped is decided by what the machine has, not by anything
the workout says at run time, so a requirement that is met leaves the safety net exactly as strict as
it was. A requirement that is not met skips the workout everywhere, including for whoever wrote it,
and the workout cannot be practised either: a declaration nobody can satisfy buys a workout nobody
can do, not a suite nobody checks.

**Nothing expresses a minimum version**, deliberately: the check answers "could this run", not "will
it work". So **say the version in the brief**. `orders-migration-postgres` is about 17 specifically
and its harness needs 14 or newer, and on 12 it would skip nothing and fail confusingly.

### The port you declared is the port your suites connect to

A workout that reads `PGPORT` for itself gets checked on one port and connects to another, and the
failure that follows looks like the exercise rather than like the environment. So the runner puts
every declared port on the spawned process, in declaration order, as `HONE_REQUIRED_PORTS`, and a
workout that needs one reads it there:

```ts
const [declared] = (process.env.HONE_REQUIRED_PORTS ?? '').split(',');
```

It is written on every run and empty for the workouts that declare nothing, so a stray value in
somebody's shell cannot reach a workout that never asked for one. The runner knows nothing about what
is on the other end: a port is a number the manifest declared, and turning it into a Postgres
connection happens in `orders-migration-postgres/files/server/db.ts`, where the workout is. The host
is not a question either, because presence is checked on loopback and only on loopback: reaching
another machine would be the network.

What the environment still answers is who you connect as, which no requirement speaks to. That
workout keeps `PGUSER`, `PGDATABASE` and `PGPASSWORD`, and pins the host and the port.

### What the suite enforces

`workouts.spec.ts` asserts every solution passes every checkpoint and every starter fails at least
one, and that every checkpoint has a distinct id and an existing suite. That is what makes workout
content as safe to edit as problem content. `test-run.spec.ts` covers the manifest's `testRun`: a
fixture workspace gets its declared zone and its declared setup file, the same fixture declaring
neither is untouched, and a zone or a setup file that would fail quietly is refused at load.
`requirements.spec.ts` covers `requires` from every side, and depends on nothing being installed:
the present case is a stub executable on a `PATH` the test prepends to and a socket the test opens,
the absent case is a name nothing answers to, and the skip is proved by running against a workspace
that does not exist, where a spawned vitest would crash. It also proves the port handoff the only
way it can be proved, with a fixture suite that reads `HONE_REQUIRED_PORTS` inside the spawned run:
once for the port its workout declared, and once for a workout declaring nothing while the parent
process holds a value of its own.

## The essentials path

A session on the path is an hour on one slice of the work, and it authors nothing. It orders pages,
reps and workouts that already exist, which makes it the one kind of file here judged on selection
rather than on writing.

It is also the only thing in Hone not judged against a 15-minute morning session. That is the
point of it: the morning queue stays interleaved and spaced because that is what retention wants,
and a session here is blocked and ordered because that is what building a model the first time
wants. Both are correct, at different stages, and the app offers them as separate entrances rather
than making one a setting on the other.

### Where it lives

`packages/paths/content/<slug>/path.json`, one directory per session. The manifest carries `slug`,
`title`, `question`, `summary`, `order`, `minutes` and `steps`. A step is `{ kind, ref, note? }`,
where `kind` is `page`, `problem` or `workout` and `ref` is `section/slug` for a page and a bare slug
for anything else. A `module` step counts as a read step, because it is what a session about an API
has instead of a page.

### The shape of an hour

| Part  | Budget | What it is                                                    |
| ----- | ------ | ------------------------------------------------------------- |
| Read  | 20 min | Two or three handbook pages, in order, building on each other |
| Prove | 15 min | Six to ten reps drawn from those pages, in a fixed order      |
| Build | 20 min | One workout, where a fitting one exists                       |
| Slack | 5 min  | An hour that needs all sixty minutes is an hour that overruns |

A session without a workout is fine and spends the time on more reps. A session that cannot fill the
read step from existing pages is not ready to be written.

### The bar

- **The `question` is the test.** Name the session by the question the hour answers. A slice you
  cannot name that way is two sessions or none.
- **The path is a subset, deliberately and permanently.** Most content is not on it and never will
  be. The test for including a page: would leaving it out make the hour incoherent? Not "is it
  good", which everything here is meant to be. If every page eventually appears on some session, the
  path has become an index and has stopped being a recommendation. The suite fails at three quarters
  coverage so that this is a conversation rather than a surprise.
- **A session is one slice, not one section.** The most valuable ones cut across sections, because
  that is how the work does. "Why the page is slow" is a React page, a database page and an N+1 rep,
  and it is a better hour than anything wholly inside one section.
- **Order is fixed and meaningful**, and the loader enforces it: read, then prove, then build.
- **No new progress tracking.** Where you left off is derived from the reps, which carry their own
  progress. A session shows you that; it does not score you.

### What the suite enforces

`paths.spec.ts` refuses a session whose `ref` resolves to nothing, whose steps run out of order,
which has no page step or no problem step, which names a kind nobody has heard of, or whose `order`
collides with another session's. It is the same net that already checks a page's `practise` slugs resolve,
which is what makes an ordering safe to edit: content moves, and a stale reference fails the build
rather than the reader.

## Modules

A module is one sitting with one API: fifteen to twenty-five minutes, ordered steps, and at every
step you commit to an answer before the answer appears. The other three types assume you already
know the thing you are practising. A module is for the APIs you use constantly and understand
shallowly, where the problem is not that you are stuck but that your model is wrong in a way that
has never cost you enough to notice.

| Type    | Length    | You arrive            | It measures                     |
| ------- | --------- | --------------------- | ------------------------------- |
| Problem | 60-90s    | knowing the concept   | recall, on a schedule           |
| Workout | 25 min    | knowing the stack     | execution under time            |
| Page    | 3-4 min   | needing one answer    | nothing, deliberately           |
| Module  | 15-25 min | not really knowing it | whether you can predict the API |

### The step

Every step is predict, run, correct:

1. **Predict.** The step states a question with a definite answer and takes yours before running
   anything. Committing to a wrong answer is what makes the correction stick.
2. **Run.** Your code, or the step's code, through the grader Hone already has.
3. **Correct.** What actually happened, and the one sentence explaining why.

**A step that cannot pose a question with a definite answer is a handbook page, and belongs there.**

### Shape on disk

```
packages/modules/content/<slug>/
  module.json          title, summary, order, minutes, practise, sources, verified
  01-<step-slug>.md    steps, ordered by filename prefix
  02-<step-slug>.md
```

A step is markdown with `title` and `predict` in frontmatter and two tagged fences, ` ```js run `
and ` ```js assert `. Assertions are expressions evaluated after the snippet, exactly as `js-code`
problem tests are, and the IIFE rule carries over unchanged: **one assertion per line**, so anything
multi-step is wrapped in `(() => { ... })()` on a single line. The fences carry the code rather than
the frontmatter, because a tagged fence is already valid markdown and renders on GitHub. The loader
lifts both fences out of the body, so the prose never renders the snippet or the answer twice.

The numeric prefix orders the files and is not part of a step's identity, so renumbering a module
does not change anybody's links.

`practise`, `sources` and `verified` mean what they mean everywhere else, and the citation policy
applies unchanged.

The safety net mirrors the other two: every step's assertions pass against its own snippet, every
step has a predict question, every `practise` slug resolves, and every module cites something.

### Assertions run on someone else's machine

There is no fake clock and no fixed timezone behind the run button, so an assertion that depends on
the host's zone, locale or wall clock passes for its author and fails for the reader. Write ones that
hold anywhere: compare against `Date.UTC(...)`, state the relationship through `getTimezoneOffset()`,
name the zone explicitly in `Intl.DateTimeFormat`. `js-date` is the worked example and its assertions
were checked in five zones before it shipped.

Assertions are also about the API rather than about the reader's edit. They keep holding when the
snippet is changed, which is exactly what makes the snippet safe to play in: trying the next thing
that occurs to you is most of the value of the step being editable.

### The test that decides between a page and a module

**A model is a page. An API is a module.** `URL` and `URLSearchParams` is the worked example:
repeated keys, `set` against `append`, the plus-sign space trap, `encodeURIComponent` aimed at the
wrong thing. None of those is a mental model; they are the edges of one API met one at a time. So
**a category's pairing can be satisfied by a module**. An area is unexplained when nothing explains
it, not when no page explains it.

A module is also a legal step inside an essentials-path session, which is the only relationship the
two have, and it counts as a read step there: it is what a session about an API has instead of a
page. They share a viewer, not a purpose: a session sequences things that assume you already know
roughly where you are, and a module is the one format that does not assume it.

### Non-goals

Not a course platform: no enrolment, no percentage complete, no streaks on modules. Modules get no
progress tracking at all, for the same reason pages get none: the problems are the progress
tracking, and a module's `practise` list is how it shows up in your queue afterwards. No branching,
so a module that needs a decision tree is two modules. No video, no audio, no animation. And not a
replacement for the handbook: a module teaches an API from the beginning, a page answers one
question when you already know roughly where you are.

## Decks

A deck is a contrast set: `INNER` against `LEFT` against `FULL`, 301 against 302 against 307, `null`
against `undefined`. Two-sided cards, a few seconds each. You flip a card, say whether you had it, and
nothing is written down.

**A deck is an authoring unit, not a session.** The reader never picks one: `/cards` shuffles the
whole library into one run. What the deck exists for is the `page` it cites, which is the only thing
standing in for the assertions a module gets free, and grouping cards by the page that proves them is
what makes that check possible. Write a deck as a coherent set anyway, because a set that does not
hang together is usually one whose cards are not all checkable against the same page.

The daily queue refuses this material, and that refusal is right: a definitional rep there displaces
a rep about doing the work. It stops holding the moment you have opted in to drill distinctions,
because then the definition is exactly the point. So cards sit outside the round robin and are never
dealt to a morning session.

### Where it lives

`packages/decks/content/<slug>/deck.json`, one directory per deck with nothing else in it. The server
reads the directory per request, so a new deck needs no restart. A deck is one JSON file rather than a
file per card because a card is two sentences: a module step earns a file by being prose plus a
runnable snippet, and a card has neither.

### The manifest

- `slug` matches the directory name. `order` places the deck and is unique across decks.
- `title` and `summary` name the contrast set and say what it costs to get it backwards. `minutes`
  budgets the sitting.
- `page` is a `section/slug` handbook reference and is **required**. A deck cites the page rather than
  teaching the material again, which is also what makes a card checkable.
- `practise` is one or more problem or workout slugs, resolved the way a page's list is. It is how a
  deck reaches your queue afterwards, and it is the only progress a deck has.
- `sources` and `verified` mean what they mean everywhere else, and the citation policy applies
  unchanged.
- `cards` is 4 to 12 of them. Fewer is not a sitting; more is two decks.

A card is `{ id, front, back }`. `id` is kebab-case, unique within the deck, and the URL fragment.
`front` and `back` are markdown and **one line each**, capped at 160 and 400 characters. The caps are
the format rather than a style note: a back that does not fit on one line is a card that has become a
page, and the deck already cites the page it would become.

### A card drills a distinction, not a definition

The front is a question with a definite answer, and the answer is what separates two things you
already half know. "What does `LEFT JOIN` do" is a definition and belongs on the page the deck cites.
"`INNER JOIN` and `LEFT JOIN`, same `ON` condition: what is in one result and not the other" is a
card, because getting it backwards is a bug you have shipped.

The back answers in its first sentence and spends the rest on the one number or the one query that
makes it stick. Write it so you can tell whether you had it, because you are the grader: an answer
that only half matches is a card whose front asked for something vaguer than it meant.

### What the suite enforces

`decks.spec.ts` refuses a deck whose `page` is not a real handbook page, whose `practise` names
anything that is not a real problem or workout, which cites no source or dates its `verified` in any
format but `YYYY-MM-DD`, which has fewer than 4 cards or more than 12, or whose `order` collides with
another deck's. Per card: two non-empty sides, a kebab-case id unique within the deck, no newline in
either side, and neither side over its cap. It also refuses two cards asking the same question
anywhere in the library, comparing fronts with case and punctuation stripped, because that is the
drift a deck falls into and it costs the sitting twice.

**What it cannot check is whether a card is true.** A module gets that free, because its assertions
run against its own snippet; a card has nothing to run, and a confident wrong sentence looks exactly
like a confident right one. That is the work `page` and `sources` are doing, and the review rule
follows from it: every claim on a card has to be checkable against the page it cites. A claim the page
does not support is a page edit before it is a card.

## Pairing

The library's halves do not run away from each other, and the rule has two directions:

- **Every page names somewhere to practise it.** Enforced: a page with an empty `practise` list
  fails `pnpm verify`. This is what stops the handbook becoming a wiki nobody opens.
- **Every area with real practice volume earns pages.** Not enforceable, and the direction that
  actually drifts. A category can grow to thirty problems while the concept behind them is written
  down nowhere.

**Not 1:1, deliberately.** A page can be served by problems from three categories, and one workout
can be the practical half of four pages. The target is that nothing is orphaned, not that the counts
match.

Two things pairing does not measure, both worth checking by hand. A section with pages and no
workout is reading that has never been tested under time pressure. And a page can be fully paired
and still offer nothing but the hard version, which is the on-ramp missing; see the easy-rep rule
above. Neither is mechanically enforced, and "has an easy problem" would be the wrong thing to
check, because passing it by writing trivia is easier than passing it honestly.

## What outranks pairing

The subject is practical knowledge for web engineering and AI engineering, judged against a
15-minute morning session. Content earns its place by being useful in that work, never by completing
a set, and completionism is the failure mode to watch for because it looks like diligence and is
easy to measure. An uncited problem is not debt, and a gap nobody would notice while working is not
a gap. Where a topic is genuinely not worth a page, say so and leave it, in the document that raised
it. `CLAUDE.md`, under "What it is for, and what that rules out", is the long version.

## Citing sources

The content draws on other people's teaching, and a lot of it is machine-written. The policy is
structural rather than a matter of good intentions, and `pnpm verify` enforces the mechanical half.

1. **Every page ends with a sources footnote**: author, title, canonical URL. At least one. "Common
   knowledge" still cites the official docs it was checked against.
2. **No link shorteners, ever.** `lnkd.in`, `bit.ly`, `t.co` and friends are rejected outright.
   Resolve a shortlink to its canonical target before citing it; if it is dead or the author cannot
   be identified, re-source the claim from a primary reference or drop it.
3. **Fetch every URL before it ships.** Links rot, certificates expire, and publishers move papers
   behind a paywall. Replace what does not resolve with a verified copy of the same work, and where
   a paper has a DOI, carry it in plain text so the citation survives its link.
4. **Name inspirations, reproduce nothing.** Where material traces to a course or a book, credit and
   link it, then write the page fresh in this project's own words. No course text, exercises or
   structure gets copied. Crediting generously and copying nothing are the same policy.
5. **Paywalled sources are inspiration, never the load-bearing citation.** A paid course gets credit
   for shaping the material, and every claim on the page must still be checkable against an open
   reference. If no open reference exists for a claim, the claim does not ship, and if nothing on
   the page rests on the course at all, it does not need to appear.
6. **LLM-generated source material is not a source.** Verify each claim against a primary reference
   and cite that. The note itself is never the citation.
7. **`verified` means what it says**: the date the claims were last checked against the sources
   listed. It is shown to the reader, so it is bookkeeping, not decoration.
8. **Problems and workouts credit when there is someone to credit.** Most reps are common material
   and need nothing; where one traces to a specific person's teaching, name them, in the workout's
   brief or the problem's explanation.

Sources are cited for the claim actually made, not for the general authority of the field. That is
the one rule of the eight most easily broken by accident.

## Voice

`WRITING.md`, in full, for everything a reader sees: prompts, hints, explanations, grader feedback,
briefs, checkpoint hints, pages, module steps, cards and UI strings. It is short. The em-dash rules
are the ones that bite, and never bulk-regex dashes out of prose: it mangles dual-dash asides.
