# Hone — agent context

A local-first practice app for keeping web-dev fundamentals sharp. Read `README.md` first for what it
does and how to run it. This file covers what an agent needs to change it safely.

**The code is the source of truth for what exists.** No document in this repo lists what has shipped,
by design: the seed files and the `content/` directories under `packages/handbook`,
`packages/workouts`, `packages/modules`, `packages/paths` and `packages/decks` are the live
inventory, and a status line would only go stale. Three documents hold what the code cannot say, and
this file is the entry point to them:

- **`docs/content.md`** — the bar every problem, handbook page, workout, module, deck and
  essentials-path session clears, and how to write each one. Read the relevant section before adding
  content.
- **`docs/decisions.md`** — why things are the way they are, and what this project deliberately
  refuses to do. Read it before reopening a settled question or filling a gap that looks obvious;
  several of those gaps are recorded refusals.
- **`docs/roadmap.md`** — only what is not built. A row leaves it when the thing ships.

Six version-numbered PRDs preceded these and were folded into them. Git history has the originals if
a piece of reasoning seems to be missing.

## What it is for, and what that rules out

Practical knowledge for **web engineering and AI engineering**: what you actually hit shipping
features, and increasingly what you hit shipping features against a model. Content earns its place by
being useful in that work, judged against a 15-minute morning session. Nothing earns its place by
completing a set.

**Completionism is the failure mode to watch for**, because it looks like diligence and is easy to
measure. The library has four content types, problems, workouts, handbook pages and modules, and they
do not map onto each other. A problem does not owe a page. A page does not owe a workout. An API that
earns a module does not owe one to every neighbouring API. A category does not owe an even spread of
difficulties. The `explanation` field is read in the thirty seconds after solving and is
meant to carry the lesson on its own, so most reps need nothing behind them at all.

What a page is for is the model that several reps share, where getting that model wrong is what makes
all of them fail. A fact you would look up is a rep and nothing more. Only one mapping is enforced,
and it is the only one worth enforcing: a page names somewhere to practise it, or it does not ship.

So **an uncited problem is not debt**, and a gap nobody would notice while working is not a gap.
Where a topic is genuinely not worth a page, the right move is to say so and leave it, in the
document that raised it. Several such refusals are already recorded in `docs/decisions.md`; add to
them rather than quietly closing them.

## Hard constraints

- Stack is fixed: pnpm workspaces, Vite + React + TS + Tailwind + shadcn/ui, NestJS + Drizzle +
  better-sqlite3, Vitest. Don't substitute.
- Fully offline at runtime: no external API calls, no keys, no telemetry. Grading is deterministic;
  there is no LLM in the loop. **A local process is not the network**: workouts already bind a port,
  and one may require something this repo does not ship when the lesson needs it, provided it is
  declared in the manifest's `requires` and so skips cleanly when absent. See the "offline is three
  questions" entry in `docs/decisions.md`.
- User SQL runs only against `practice.db` opened readonly, never `app.db`. `ATTACH` is refused.
- TypeScript strict everywhere. Shared API types live in `packages/shared`, which builds to both
  CJS and ESM so Nest and Vite can each resolve named exports.
- Strictness flags live in `tsconfig.base.json` and every package extends it. Add a flag there, not
  in one package, so the three can't drift apart again.

## Layout

```
packages/shared/src/index.ts       types + const tuples, no runtime deps
packages/workouts/content/<slug>/  workout content: manifest, brief, files, tests, solution
packages/paths/content/<slug>/     the essentials path: one path.json an hour, ordering the above
packages/modules/content/<slug>/   modules: a manifest and one markdown file per predict-run step
packages/decks/content/<slug>/     decks: one deck.json of two-sided cards over one contrast set
apps/server/src/
  db/                              Drizzle schema, client, migrations module
  grading/                         five graders + the code runner and the type checker
  seed/problems/<category>.ts      problem content, one file per category
  problems/ progress/ sessions/    Nest modules
  paths/                           the essentials path: loader, safety net, read-only API
  modules/                         modules: loader, safety net, and the step run endpoint
  decks/                           decks: loader, safety net, read-only API (nothing is persisted)
  workouts/                        workspace materialisation + the vitest checkpoint runner
  cli/grade.ts                     `pnpm grade` grader-inspection tool
apps/web/src/
  pages/                           Dashboard, Session, Practice, Problem, Problems, Paths, Modules
  components/CodeEditor.tsx        CodeMirror 6 wrapper, used for sql and js-code answers
  components/DiffView.tsx          your workout file against the reference; lib/diff.ts is the LCS
  components/ui/                   hand-written shadcn components
```

## Working on it

- **Adding or editing problems** touches only `seed/problems/*.ts`. Problems upsert by slug, so an
  edit updates in place without wiping attempt history. `position` is generated in
  `problems.seed.ts`, never authored.
- **`tags` is optional and almost always absent.** A tag cuts across categories so a posture can be
  practised on purpose, and the bar is whether somebody would deliberately spend fifteen minutes on
  it. The daily queue ignores tags entirely. `problems.seed.spec.ts` refuses a tag with no reps, or
  one whose reps all sit in a single category.
- **`OPT_IN_CATEGORIES` is the opposite of a tag**, and `dsa-patterns` is its one member: the daily
  queue never deals a category listed there, so it is reached by scoping practice or a session to
  it. It holds back only reps you have never touched, so review, the missed count and the review
  ladder all keep working once you have attempted one.
- **Every problem declares a `relevance`**, which is a separate axis from difficulty: `daily` for
  what you write in ordinary feature work, `occasional` for a bug or a perf pass or an edge case,
  `foundational` for what you meet through a framework more often than you write. Author it
  honestly. A hard problem can be daily bread and an easy one can be pure trivia, and the label is
  what lets a 15-minute session be judged on what it is actually teaching.
- **`js-code` tests take an `expression`, not statements.** It is evaluated after the submission, so
  multi-step setup has to be wrapped in an IIFE. Use `expectedCode` for values JSON cannot hold.
- **`ts-type` reps are type-checked, never run.** A check is `type` + `equals` (compared for
  identity, not assignability), `compiles`, or `rejects`, and exactly one of the three. The library
  is ES2022 and imports resolve to nothing. `close` is earned by a type that is assignable in both
  directions without being the one asked for, which is what `any` and a dropped `readonly` both do.
- **After editing problems, run `pnpm seed`.** Boot only auto-seeds an empty database.
- **Schema changes** need `pnpm --filter @hone/server db:generate` and the generated SQL
  committed. Migrations apply automatically at startup.
- **`pnpm verify` is the gate**, and CI runs the same thing. It fans typecheck, ESLint, Prettier and
  the test suite out in parallel, after auto-fixing your changed files. Run it before saying you're
  done, not `pnpm test` alone.
- **The test suite is what makes problem content safe to edit.** It asserts every canonical answer
  grades `correct`, every near-miss grades `close`, every regex compiles, no keyword synonym
  normalises to an empty string, and every coding problem's reference passes its own tests while its
  starter does not.
- **Seeding without touching the real database:** set `HONE_DATA_DIR` to a scratch path. Useful
  for checking the seeder end to end when the user is mid-streak.
- **`pnpm hone:export` / `pnpm hone:import` move progress between machines**, keyed by slug because
  `problems.id` is a seeding-order artefact that differs per machine. Import merges and is idempotent.
  Never suggest copying `app.db` between machines instead: see ADR-0169.
- **Adding a module** is a directory under `packages/modules/content/`. `modules.spec.ts` runs every
  step's assertions against its own snippet, so a module that teaches something untrue fails the
  build. Assertions run on the reader's machine with no fake clock or fixed timezone: write ones that
  hold in any zone, and see `docs/content.md` before authoring.
- **Adding a deck** is a `deck.json` under `packages/decks/content/`, and no application code moves.
  `decks.spec.ts` resolves the required `page` and every `practise` slug, holds a deck to 4 to 12
  cards and each card to one line a side within its cap, and refuses two cards asking the same
  question anywhere in the library. What it cannot check is whether a card is true, so every claim
  has to be checkable against the page the deck cites. Cards are self-graded and nothing is
  persisted: no table, no migration, no write path.
- **Adding a session to the essentials path** is a `path.json` under `packages/paths/content/`. It
  authors nothing: it orders pages, reps and workouts that already exist, and `paths.spec.ts` refuses
  a ref that resolves to nothing or a rep placed before the page explaining it. The path is a subset
  on purpose, so read the bar in `docs/content.md` before adding one: the test is whether leaving
  something out would make the hour incoherent, not whether it is good.
- **Adding a workout** is a new directory under `packages/workouts/content/`. No application code
  changes. `workouts.spec.ts` then asserts the solution passes every checkpoint and the starter does
  not, which is what makes workout content as safe to edit as problem content.
- **`pnpm workout <slug> [--stack node|express|nestjs|react]` scaffolds that directory**, mirroring
  `pnpm grade`. It emits the layout, the manifest and the suite wiring that every workout shares,
  including the supertest binding that has bitten twice, and leaves everything that varies as a
  marked gap. A fresh one deliberately fails its own spec until you write it.
- **A brief states the symptom, never the cause.** Working out what is wrong is the exercise, so
  `brief.md` and the manifest `summary` describe what someone would report ("9 seconds in
  production"), not the diagnosis ("a query per row, and no index"). Constraints and unguessable
  environment details stay explicit; checkpoint hints are where it is safe to be specific, because
  they appear only after that checkpoint has failed. See `WRITING.md`.
- **The whole of a workout's `src/` is readable in the editor**, and only the manifest's `editable`
  list can be typed in. That is what the briefs saying "read `contract.ts`, it is the specification"
  always meant, so a fake's semantics belong in the file rather than paraphrased into the brief.
- **A checkpoint whose subject is a shape can hand the payload over**: `record(label, value)` from
  `hone/record` puts text beside that checkpoint's verdict. It cannot fail a checkpoint, most
  checkpoints want nothing, and it is a transcript rather than a preview. See `docs/content.md`.
- **A workout needs a new library?** Add it to `packages/workouts/package.json`. Workspaces symlink
  their `node_modules` at that package, which is how a workout imports the real drizzle-orm.
- **A workout needs a daemon this repo does not ship?** Declare it in the manifest's `requires`
  (a binary, a loopback port, or both, plus an install line and a reason), and everything degrades on
  a machine without it: the runner skips before spawning vitest, `start` is a 409, the page says what
  to install, and `workouts.spec.ts` skips that workout instead of failing. A declared port is also
  the port the suites are handed, as `HONE_REQUIRED_PORTS`, so nothing reads `PGPORT` for itself.
  `pnpm workout --requires postgres:5432` scaffolds the block. Reach for a fake first, and read the
  bar in `docs/content.md`.

## Conventions

- All user-facing copy follows `WRITING.md`. Read it before writing or editing any prose: problem
  prompts, hints, explanations, grader feedback, briefs, handbook pages, UI strings and repo docs.
  The em-dash rules are the ones that bite, and never bulk-regex dashes out of prose: it mangles
  dual-dash asides. Rewrite by hand and diff sentences that contained a pair.
- Commit in meaningful increments with plain descriptive messages.
- Prettier owns formatting: single quotes, 100 columns, semicolons. Never hand-format to fight it.
- ESLint runs type-aware. When a rule fires on something deliberate, prefer an inline disable with a
  one-line reason over widening the config; only add a config override when a whole directory shares
  the same justification.
- Keep `apps/server/data/` gitignored. Migrations and seed sources are committed.
- shadcn components are hand-written into `components/ui/`, not pulled from the CLI. Add only what
  gets used.

## Gotchas that have already bitten

- **`request(app)` in a checkpoint suite binds a fresh ephemeral port per request.** Hand supertest
  a listening server instead (`server = app.listen(0)` in `beforeEach`, `server.close()` in
  `afterEach`, then `request(server)`). A suite that loops requests otherwise leaves hundreds of
  ports in `TIME_WAIT` and fails as `socket hang up` under the parallel load of `pnpm verify`, on a
  different checkpoint each time. Keep the `app` binding as well if a test reads `app.locals`.
- `node:vm` in `grading/code-runner.ts` is an isolation convenience, **not** a security boundary,
  and errors thrown inside it fail `instanceof Error` because they come from another realm.
- The answer box takes focus on load, so single-key shortcuts (`n`/`p`/`s`) only fire after `Esc`.
- Session item outcomes are derived from a per-item snapshot of `solved_at`/`last_skipped_at`, not
  from a timestamp comparison against the session start, because a skip and a session start can
  land in the same millisecond.
- `solved_at` is refreshed on **every** correct answer, not just the first, so completed reviews are
  visible to that snapshot comparison.
