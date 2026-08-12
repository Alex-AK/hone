# Hone

A local-first practice tool for staying sharp on web-dev fundamentals. Six ways in:

- **Problems** are short reps: type an answer, get tiered feedback (correct / close / not close),
  come back to it on a spaced-repetition schedule.
- **Workouts** are 20-minute builds against a real toolchain: read a brief, edit real files, run
  checkpoints, see how far you got.
- **The handbook** is what you read beside a workout: one concept a page, sources on every one, and
  links to the problems and workouts that make you prove you absorbed it.
- **Modules** are one sitting with one API: ordered steps, and every step asks you to commit to an
  answer before it runs the code.
- **Cards** drill the distinctions the queue refuses: a deck of two-sided cards over one contrast
  set, flipped and graded by you, entered on purpose rather than dealt to a morning.
- **The essentials path** is for the hour you have on a weekend: a curated route through what already
  exists, read then prove then build, on one slice of the work at a time.

You write every answer yourself and a deterministic grader marks it, so the reps stay yours. No AI
in the loop at runtime, fully offline, single user, no accounts.

**Status:** built and in daily use. Content grows continuously and is never finished, so this README
describes the shape rather than counting it; the app and the seed files are the live inventory. The
same principle governs the docs: [docs/content.md](./docs/content.md) is the bar every problem, page,
workout, module, deck and essentials-path session clears,
[docs/decisions.md](./docs/decisions.md) records why things are the way they are and what the project
deliberately refuses to do, and [docs/roadmap.md](./docs/roadmap.md) holds only what is not built
yet.

## Quickstart

```sh
pnpm install
pnpm dev        # server on :3001, web on :5173; DB auto-migrates and auto-seeds
```

Open http://localhost:5173 and hit **Start**. Requires Node 20+. Nothing else: no API keys, no
accounts, no network calls at runtime.

![A coding problem graded: two of four assertions passing, with expected vs actual for each failure and the first hint unlocked](docs/screenshot.jpg)

```sh
pnpm verify     # the gate: typecheck, lint, format and the full test suite, in parallel
pnpm test       # graders, seed data, every kind of content, queue, sessions
pnpm build      # typecheck and build every package
pnpm seed       # rebuild practice.db and upsert problems by slug
pnpm grade      # check a grader from the terminal (see below)
```

`pnpm verify` formats and lint-fixes your changed files before it checks them, so most of what it
would complain about is gone by the time it reports. It runs on pre-push; `SKIP_VERIFY=1 git push`
skips it. Commits run `lint-staged` instead, which only touches staged files.

`pnpm dev` only auto-seeds an **empty** database. After adding or editing problems, run `pnpm seed`
to upsert them into an existing one.

## The daily loop

Four places, and the first one is where a morning starts. **Today** asks one thing, which is whether
you are starting or carrying on a session, and lists the other formats underneath by how long they
take. **Library** is where you go when you want something in particular: problems, workouts, modules
and the essentials path, each a tab. **Handbook** is the reading. **Progress** is what you have
covered and what is thin, on a page you visit rather than one you land on.

`/session` pins a fixed set of problems (5, 10 or 20) so the list cannot shift underneath you.
Every problem page then shows `Problem 3 of 10` with a progress bar, Next and Skip stay inside the
session, and finishing gives you a summary with solved / skipped counts and elapsed time.

Due reviews come first, then new material. Solved problems leave the queue, so tomorrow picks up
where today stopped. Only one session runs at a time; starting a new one closes the old.

- **Spaced repetition.** Solving schedules the problem to come round again after 1 day, then 3, 7,
  21 and 60 as you keep getting it right. Failing a review drops it back to the first rung. Solved
  is sticky, so a failed review never unsolves anything. `/practice?mode=due` serves what is due.
- **Review queue.** `/practice?mode=review` serves everything you attempted **or skipped** and have
  not yet solved. Progress links to it whenever there is something waiting.
- **Focused practice.** `/practice?category=react&difficulty=hard` drills one slice without pinning
  anything, running until the queue empties. Repeat a param to widen the slice:
  `?category=react&category=css` runs both. The scope lives in the URL, so it survives a refresh
  and follows you through Next / Previous / Skip. Start one from a category on Progress, or from the
  problem list with **Practice these**.
- **Tags cut across categories.** `/practice?tag=reading` runs the reps that hand you unfamiliar code
  and ask what it does, wherever they live. A tag is an entrance, not a filter on the morning: the
  daily queue keeps dealing tagged reps in their own categories. The **Focus** row on the problem
  list and the session form scopes by one.
- **Keyboard.** `/` focuses the answer box, `Cmd/Ctrl+Enter` submits, `n` / `p` move, `s` skips,
  `Esc` leaves the box. The answer box takes focus on load, so press `Esc` before using the
  single-key shortcuts.
- **Starting over.** The reset on Progress clears statuses only, or clears everything (attempts,
  schedules and sessions) and returns to the zero state.

## Problem library

One file per category in `apps/server/src/seed/problems/`, which is the live inventory. Roughly:

- **Data** — SQL from joins through window functions and recursive trees, and query plans.
- **The language** — JavaScript under the hood (references, equality, mutation, the event loop),
  TypeScript from utility types through conditional types and `satisfies`, and write-the-function
  coding problems with real assertions.
- **The browser** — React, the DOM, semantic HTML, accessibility, CSS, forms, dates.
- **The wire** — HTTP status codes and methods, headers, caching, CORS, SSE and WebSockets, auth
  and security.
- **Systems** — one concept a rep: consistency, replication, sharding, queues, circuit breakers.
- **Debugging** — spot-the-bug snippets, mostly the mistakes fast thinking makes.

Every problem declares a **relevance** alongside its difficulty: `daily` for what you write in
ordinary feature work, `occasional` for a bug or a perf pass, `foundational` for what you meet
through a framework more often than you write. That is what lets a 15-minute session be judged on
what it is actually teaching.

The queue runs easy → medium → hard and round-robins across categories, so you never get twenty SQL
questions in a row. `pnpm grade --list <category>` prints the current slugs.

## How grading works

All grading is deterministic and local. No LLM, no network.

- **SQL** runs your query against `practice.db` opened **read-only**, then compares raw row
  values against the canonical solution executed at the same moment. Column names and aliases never
  matter; row counts, values and (where stated) order do. Non-read statements are refused, as is
  `ATTACH`, so `app.db` is unreachable from user SQL.
- **Coding** runs your function against real assertions and reports per-test pass/fail with
  expected vs actual. Console output from a failing test is attached to the diff. The editor
  prefills the signature so your function name matches the tests.
- **Short-text** normalises both sides (case, whitespace, quotes, code fences, trailing
  punctuation), then checks exact matches, regex patterns, known near-misses, and finally fuzzy
  matching for typos.
- **Explain** scores keyword groups: every idea must appear, half of them earns a "close".
- **Types** type-checks what you wrote and asks the compiler what it inferred, so a conditional
  type or an assertion function is practised by writing one rather than by describing it. A type
  that is assignable to the answer and back again without being the answer, which is what `any` and
  a forgotten `readonly` both produce, earns a "close" and a sentence saying so.

Every non-correct attempt reveals the next hint. After three attempts you can reveal the solution,
which marks the problem skipped rather than solved.

Hints belong to an attempt cycle rather than to the problem, so solving clears them and the review
weeks later opens with none showing. Get that review wrong and you unlock them again the same way.

### Running your code

Coding problems execute in a `node:vm` context with a 1 second timeout and no `require`, `process`
or filesystem access. **That is an isolation convenience, not a security boundary.** Determined code
can reach the host realm through constructor chains. It is fine here because Hone runs locally and
executes only code you typed yourself, which is the same trust level as `pnpm dev`. Do not reuse
`grading/code-runner.ts` to run code from anyone else.

Type problems never execute anything. What they need instead is a compiler that cannot read the
disk, so the one they use answers only from memory: an import, a `/// <reference path>` and a
`@types` lookup all resolve to nothing, and the library is ES2022 with no DOM and no Node types.

### Tuning a grader

Answers are matched by pattern, so a grader can be too strict. Check one directly:

```sh
pnpm grade js-find "find"                # verdict + the exact config it was measured against
pnpm grade code-chunk "function chunk…"  # prints per-test results
pnpm grade sql-anti-join "SELECT …"      # SQL runs against the seeded practice.db
pnpm grade ts-mutable-mapped "type …"    # type-checked, with expected and inferred side by side
pnpm grade js-find                       # show the prompt and the model answer
pnpm grade --list react                  # slugs in a category
```

## Workouts

A workout is 20-25 minutes against a real toolchain. The library lists them; opening one gives you
a brief written like a ticket, the project's files in an editor, and a timer. **Run** materialises
your files into a workspace on disk and runs the checkpoint suites against them.

A checkpoint is one test file, and it passes only when every assertion in it does. That is what
makes an unfinished attempt worth something: at ten minutes you can see two of four green, and the
failure output tells you which behaviour is missing. Each checkpoint carries a hint that appears
after it fails. The reference solution is there when you want it.

While you are iterating on one failure, **Run** on that checkpoint runs its suite alone. The others
are not re-checked, so they dim and say so rather than showing a tick nobody earned: a single
checkpoint never raises your best score, and the reference unlocks only on a full green run.

Once it is unlocked, the editor pane switches between **Mine**, **Diff** and **Reference**. Diff is
the one to review with: your file against the reference, line by line, with the unchanged runs folded
away.

Two shapes: **build a feature** and **find the bugs**. A brief states the symptom and the
constraints, never the cause, because working out what is wrong is the exercise.

**Breadth of stack is the point**, not a side effect: reading an unfamiliar codebase under time
pressure is the thing being practised, so the same brief on a tool you do not know is worth more
than a second brief on one you do. The library spans Express, NestJS and plain Node on the server;
Drizzle, Kysely and TypeORM for data; SQLite and Postgres; React on the client. Browse
`packages/workouts/content/` for the current set.

Nothing reaches the network. Postgres is [PGlite](https://pglite.dev), which is Postgres compiled
to WASM and running in-process, so `ILIKE` and `EXPLAIN` are the real thing. Redis is a small fake
with the real `ioredis` surface plus a clock you can wind forward, which is how a checkpoint waits
out a sixty-second window for free. The same trick makes a race deterministic: the fixture API takes
a per-query delay, so a checkpoint can hold one answer back until after a newer one has landed.

### Adding a workout

A workout is a directory under `packages/workouts/content/<slug>/`, and adding one touches no
application code:

```
workout.json                 manifest: stack, minutes, checkpoints, which files you edit
brief.md                     the task
files/                       the starting project
tests/checkpoints/*.test.ts  one suite per checkpoint, hidden from the editor
solution/                    the reference implementation
```

Needs a library the others don't use? Add it to `packages/workouts/package.json`. Each workspace
symlinks its `node_modules` there, so a workout imports the real drizzle-orm with no install per
attempt. `workouts.spec.ts` then holds the content to the same bar as the problems: every solution
passes every checkpoint, and every starter fails at least one.

## Handbook

The study half. A page is one concept, in a fixed shape: the question it answers phrased
the way you would ask it when stuck, the model, a worked example, the traps stated as symptoms
first, and where to practise it. A page that cannot fill the traps section honestly is a page nobody
needed.

Pages are markdown with frontmatter under `packages/handbook/content/<section>/`, so adding one
touches no application code. The links run both ways: a page lists the problems and workouts that
exercise it, and those find the pages that name them without keeping a list of their own.

`pnpm verify` enforces the citation policy mechanically — every page cites at least one source with
an author and a canonical URL, no link shorteners, every practise slug resolves, and every page has
all five parts of the shape. Two rules it cannot check, so review does: inspirations are named and
never reproduced, and a paywalled source can shape a page but never carry a claim, which must always
be checkable against an open reference.

See `packages/handbook/README.md` for the authoring contract.

## Modules

A module is the format for an API you use constantly and understand shallowly, where the problem is
not being stuck but holding a wrong model that has never cost enough to notice. One sitting, 15 to
25 minutes, and every step is predict, run, correct: the prose appears only after you have run the
snippet, because committing to a wrong answer first is what makes the correction stick.

A step is markdown with a `predict` question and two tagged fences, ` ```js run ` and
` ```js assert `, under `packages/modules/content/<slug>/`. The snippet is prefilled into the editor
and yours to change; the assertions come from disk and run through the same code runner that grades
`js-code` problems. `pnpm verify` runs every step's assertions against its own snippet, so a module
that teaches something untrue fails the build.

No progress tracking, for the reason handbook pages get none: the problems are the progress
tracking, and a module's `practise` list is how it reaches your queue afterwards. See
`packages/modules/README.md` for the authoring contract.

## Cards

`/cards` is the run itself: every card there is, shuffled, with nothing to pick first. A card drills a
distinction the handbook already explains: `INNER` against `LEFT` against `FULL`, `null` against
`undefined`. Two-sided, a few seconds each. You flip, say whether you had it, and move on, and at the
end you get a tally, the ones you missed, and the pages and reps behind them.

Decks are how cards are written and checked, not somewhere to go. The app never asks you to choose
one, because the entrance to a fifteen-minute session should not be a menu.

The daily queue refuses this material, and that refusal is right: a definitional rep there displaces
a rep about doing the work. It stops holding the moment you have opted in to drill the distinction,
because then the definition is exactly the point. So a deck is entered on purpose and is never dealt
to a morning session.

Cards are self-graded because a matcher is wrong often enough on free recall to matter, and being
marked wrong on an answer you knew is the fastest way to stop opening a deck. Nothing is written
down: no schedule of its own, no streaks, no percentage complete. Every deck cites the handbook page
it drills and the problems and workouts to practise it in, and those reps are the progress tracking.

A deck is one `deck.json` under `packages/decks/content/<slug>/`, so adding one touches no
application code. `pnpm verify` refuses a deck that points at a page or a practise slug that does not
exist, runs shorter or longer than a sitting, repeats a card id, or lets a card grow past one line a
side. What it cannot check is whether a card is true, which is why the page citation is required and
why every claim has to be checkable against it. See `packages/decks/README.md` for the authoring
contract.

## The essentials path

`/essentials` is the deliberate-study entrance, and the only part of Hone not written against a
15-minute morning. Each session is an hour on one slice: two or three pages in order, the reps those
pages explain, then a workout where one fits. The daily session stays interleaved because that is
what remembering wants; a path is blocked and ordered because that is what understanding something
the first time wants.

It adds no content. A session is a manifest under `packages/paths/content/<slug>/path.json` listing
pages, problem slugs and an optional workout, and `pnpm verify` refuses one that points at anything
that does not exist or that puts a rep before the page explaining it. Where you left off is derived
from the reps you have already solved, so nothing new is stored and nothing is scored.

The path is a subset on purpose: most content is not on it and never will be. See
`packages/paths/README.md` for the authoring contract.

## Layout

- `apps/web`: Vite + React + shadcn/ui frontend
- `apps/server`: NestJS + Drizzle + SQLite
- `packages/shared`: shared TypeScript types, dual CJS/ESM so both apps resolve named exports
- `packages/workouts`: workout content, the scaffold copied into each workspace, and the dependency
  set every workspace resolves against
- `packages/handbook`: handbook pages · `packages/paths`: the essentials path, one manifest an hour
- `packages/modules`: modules, one directory each, read by the server at runtime
- `packages/decks`: decks of cards, one `deck.json` each, nothing persisted about them
- `apps/server/src/grading`: the five graders, the sandboxed code runner and the type checker
- `apps/server/src/seed/problems`: one file per category, positions generated at seed time
- `apps/server/src/workouts`: workspace materialisation and the vitest checkpoint runner
- `CLAUDE.md`: context for coding agents, and the entry point to the rest · `WRITING.md`: how
  everything a user reads is written · `docs/`: the content bar, the decision log, and the roadmap

### Data

Two SQLite files in `apps/server/data/` (gitignored, created on boot):

- `app.db`: problems, attempts, progress, sessions, workout attempts. Six committed migrations,
  applied at startup.
- `practice.db`: the read-only dataset SQL problems query. A small bookstore: `authors`, `books`,
  `customers`, `orders`, `order_items`, `reviews`, `inventory`, and a self-referencing `employees`
  table for hierarchy questions. Rebuilt from scratch by the seeder.

`data/workouts/<attemptId>/` holds the workspace for a workout you have open, and is deleted when
the attempt finishes. Delete `apps/server/data/` to start completely over.

### Moving progress between machines

```bash
pnpm hone:export progress.json    # or: pnpm hone:export > progress.json
pnpm hone:import progress.json    # on the other machine
```

Import merges rather than replaces, so it is safe in either direction and running it twice changes
nothing the second time. Copying `app.db` between machines is **not** equivalent: progress is keyed
on an autoincrement id assigned in seeding order, so two machines hold different ids for the same
slug. The export is keyed by slug and resolved on the way in. Slugs the receiving machine does not
have are listed rather than dropped silently, which usually means the two are on different commits.

## Adding problems

Problems live in `apps/server/src/seed/problems/<category>.ts` and are upserted by slug, so editing
one updates it without wiping your attempt history. `position` is generated, not authored.

The test suite enforces the things that are easy to get wrong: every canonical answer must grade
`correct`, every declared near-miss must grade `close`, every `acceptPattern` must compile, no
keyword synonym may normalise to an empty string, and every coding problem's reference
implementation must pass its own tests while its starter must not.

## About and credits

Two things worth saying plainly, and there is a fuller version at `/about` in the app.

**This content was largely written by an LLM, and is reviewed progressively as it gets used.** A page
gets read properly during the study session it was written for, and corrected there. The test suite
guarantees that every canonical answer grades correctly and every workout solution passes its
checkpoints; it cannot guarantee that an explanation or a handbook page is true. Every handbook page
carries its sources and the date its claims were last checked against them, so you can see how far
that review has actually got. Corrections are welcome and easy to make; every piece of content is a
small file in this repo.

**The teaching methods are named, sourced, and honest about their limits.** `/how-it-teaches` in the
app covers the four techniques the app leans on, the file or screen where each one happens, and the
research behind them. It also says which part is a guess: the `[1, 3, 7, 21, 60]` review ladder was
never tuned against anything.

**It owes nearly everything to other people.** Open source software, freely shared writing, and the
people who teach: course authors, documentation writers, bloggers, and the maintainers of every
library in the lockfile. Handbook pages cite their sources in a footnote, and `pnpm verify` refuses
a page that cites nothing or cites through a link shortener. If something should be credited and
isn't, that's a bug worth an issue.

## Contributing

Issues and pull requests are both welcome. The bar is `pnpm verify` passing, which is one command
and the same thing CI runs. Content is the most useful contribution and the easiest to review: add
a problem to `apps/server/src/seed/problems/` and run `pnpm seed`, or add a workout directory under
`packages/workouts/content/`. Either way the test suite tells you whether it is well-formed. Read
[WRITING.md](./WRITING.md) first, since it governs everything a user reads. If a grader marked a
correct answer wrong, paste the output of
`pnpm grade <slug> "<answer>"` into an issue and that's usually the whole diagnosis. See
[CONTRIBUTING.md](.github/CONTRIBUTING.md).

## Licence

[MIT](./LICENSE). Fork it, take the graders, take the problems, build your own.
