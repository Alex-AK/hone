# Decisions

Why Hone is the way it is, and what it refuses to do. Every entry here was settled once, with
real alternatives on the table, and the reasoning is not recoverable from the code. Without this
file the same questions get reopened and the same deliberate gaps get "fixed".

Nothing here is status: the code is the source of truth for what exists. `docs/content.md` holds
the rules for writing content, and `docs/roadmap.md` holds what is not built yet.

**Cite the number, never the headline.** Every entry carries a permanent `ADR-NNNN`, assigned in the
order it was written and never reused. Headlines get reworded and a citation to one rots silently; a
number does not. New entries take the next number at the end of their section.

**A decision that changes gets a new entry, and the old one keeps its number.** Add
`Superseded by ADR-NNNN` to the old one rather than editing it, because the reasoning that was
overturned is usually the more useful half of the story: three refusals were reversed in a single day
here, and in each case what mattered was which part of the original argument had stopped being true.
Correcting a fact inside an entry is an edit; changing the decision is a new record.

## The product and its scope

- **ADR-0001 — This is practice, not interview prep.** Interviews are one thing the practice is good for, and
  naming the project after them would narrow what gets built. The vocabulary in the UI and the
  content stays "workout", "checkpoint" and "run", never "candidate", "grade" or "score".

- **ADR-0002 — The short-problem queue was kept when workouts arrived, not replaced.** The queue is good at
  recall and bad at everything recall is not. Reading an unfamiliar codebase and making it do
  something new under a timer is the other half, and it needed a second mode rather than a redesign
  of the first.

- **ADR-0003 — Features are judged against a 15-minute morning session.** That is the session the app is built
  around, and it is the reason material that only pays off over an hour keeps losing to material
  that fits a morning.

- **ADR-0004 — Fully offline at runtime, with no convenience exceptions.** No network calls, no API keys, no
  telemetry ever, including telemetry for "understanding usage". This is a content review rule as
  much as a code one: a workout that reaches a live API breaks it as surely as a fetch on the server
  would.

- **ADR-0005 — "Offline" is three questions, and they have three different answers.** The rule above was read
  for a long time as one rule, which quietly refused things it never named. Split, and settled:

  1. **May a workout reach the network? No, and this is not negotiable.** No live API, no key, no
     telemetry, no package fetched at attempt time. This is the rule the entry above is about.
  2. **May a workout run a local process? Yes, and it always could.** Seven bind `app.listen(0)` and
     drive it with supertest, and Nest boots a whole application. A process on loopback reaches
     nothing. Nobody ever refused this; it just sounded like the same sentence.
  3. **May a workout require a binary this repo does not ship — a real Postgres, a Mongo daemon,
     Docker? Yes, when a lesson needs one.** This was never actually decided. The nearest thing was
     Mongo's deferral, and reading it back, its operative half is "no brief so far demands a document
     store", which is the ordinary dependency bar rather than a principle.

  What the third answer costs is real and is accepted: a workout needing a daemon cannot run on a
  laptop that does not have it, which is the first crack in "no install per attempt"; startup goes
  from milliseconds to seconds inside a twelve-minute exercise; and `pnpm verify` runs every workout
  in one pass. **So the enabling requirement is graceful absence, not permission**: a workout
  declares what it needs, and both the runner and the safety net skip it with a message naming the
  missing binary rather than failing. One Mongo workout must never turn the suite red for somebody
  who does not have Mongo.

- **ADR-0006 — Graceful absence shipped before any workout used it**, as a manifest `requires` listing a
  binary, an optional loopback port, an install line and a reason. Its first bullet is superseded by
  ADR-0147; the other two stand. Three choices in it were not obvious:

  - **Presence is two questions, not one.** A binary on `PATH` and, when a port is named, something
    answering it on `127.0.0.1`. Installed months ago and not running today is the case that will
    actually happen, and "install it" is the wrong sentence to read when the thing is installed.
    The check goes no deeper: it answers "could this run", not "will it work", and a Postgres of the
    wrong major version is left for the workout's own checkpoints to discover. A wrong answer here
    is worse than a failed checkpoint, because this is the answer that decides whether a checkpoint
    runs at all.
  - **The binary is a bare name, and the loader refuses a path.** A path would resolve against the
    repo rather than against `PATH`, which is the one way this field could be made to lie about what
    a machine has.
  - **A declaration cannot dodge a suite.** What skips is decided by what the machine has, not by
    anything the workout says at run time, so a requirement that is met leaves the safety net
    exactly as strict. A requirement nobody can satisfy skips that workout everywhere, including for
    whoever wrote it, and the runner refuses to start it for the same reason: what it buys is a
    workout nobody can practise, not a suite nobody checks.

  `unmet` is resolved on the workout's own page rather than in the list, because that is where the
  clock starts and where the decision to install something gets made. A list of two dozen rows does
  not open a socket each to say so.

  What it unlocks is why it is worth the cost: a second real connection, and with it the
  migration-lock workout that was cut, isolation levels, `SELECT FOR UPDATE` and deadlocks;
  a document store; replication lag you can observe rather than describe.

- **ADR-0007 — No LLM in the grading loop.** An optional LLM feedback pass behind an API key was on the
  original roadmap and was never taken. Deterministic grading is what makes a verdict reproducible
  and inspectable from the terminal, and it is what keeps the offline constraint from being
  negotiable.

- **ADR-0008 — One user, no auth, but every user-owned row carries a `user_id`.** A single service resolves the
  current user, so adding auth later replaces that service rather than the schema. Building the UI
  for it now would be paying up front for something nobody has asked for.

- **ADR-0009 — A non-goal is a statement about the current build, not a permanent refusal.** Executing
  user-submitted code and spaced repetition were both ruled out of the first build and both were
  pulled forward later, deliberately. Reversals are recorded here with the rule they produced,
  because the rule outlives both positions.

## Content

- **ADR-0010 — Four queued items were dropped on the merits rather than because they shipped**, and they are
  recorded here so they are not re-added by someone reading the old tables in git history. **Infinite
  scroll with retry** and **drag-and-drop ordering** overlapped the retry and windowing workouts, and
  the giveaway was that their entire lesson column read "carried from the v2 backlog": a row that
  cannot say what it teaches is a row nobody chose. **Search on Sequelize** was the product-search
  brief a third time and cost a dependency, which the stack-breadth rule did not justify on its own.
  **gRPC and WebRTC pages** are not met in the feature work this project targets, and the transport
  decision page already covers when you would reach for them; tRPC keeps its page.
- **ADR-0011 — `node-fs` stays in the module list, marked as the weakest one on it.** Recording the doubt in
  the roadmap beats dropping it and beats silence, because the next person to read the list will
  otherwise have the same reservation and no way to know it was already considered. The count it was
  originally the weakest of is not the point and has changed twice since.

- **ADR-0012 — Every content type is a directory or a seed entry, never application code.** Content grows
  indefinitely, so anything that makes adding a problem, workout or page require an application
  change is a bug in the design. That is also why there is no authoring UI and should not be one.

- **ADR-0013 — The safety net is what makes volume safe.** Every canonical answer grades correct, every
  near-miss grades close, every workout solution passes and every starter fails, and it all runs in
  `pnpm verify` rather than by inspection. Content can be edited in bulk only because a machine
  checks it.

- **ADR-0014 — Breadth of stack is a goal in itself, not a side effect.** Two workouts on the same tool are
  worth less than the same two spread across tools, even when the second brief is weaker, because
  the thing being practised is reading an unfamiliar codebase under time pressure.

- **ADR-0015 — A queued workout's stack is judged against what shipped, not against the rest of the queue.** A
  row is written before the workouts it will sit beside, so its stack column ages into a collision
  nobody chose: an audit of three rows found one that would have been the second Kysely-and-PGlite
  bug-hunt over an orders list, and one that was the product-search brief a second time on the same
  ORM. Neither was wrong when written. The lesson each claims survived the audit; the stack did not,
  and the rows now say so rather than being quietly deleted or quietly built. Re-read a row's stack
  against `packages/workouts/content/` before starting it, which is the same habit the deck table
  earned the hard way.

- **ADR-0016 — All eighteen queued rows were then audited at once, and the numbers are the argument for doing
  it again.** Eight failed on their stated terms, three were cut outright, and the rest were narrowed
  in the lesson column; every one written afterwards was written from the narrowed version, and each
  of those authors found something further wrong once they ran it. **The drift is structural, not
  careless.** Nothing decays except by comparison, and a queue is a list of comparisons that were
  true when written. Audit the queue against the library whenever the library has grown a lot, and
  expect the lesson to survive where the stack and the brief do not.

- **ADR-0017 — Two `better-sqlite3` handles on one file are two real connections, which is a capability the
  workout set had and did not know it had.** "The migration that locks up" was cut because PGlite
  serves one in-process connection, and that was read at the time as there being no way to show
  contention anywhere. Measured on the installed version: a second writer against a held
  `BEGIN IMMEDIATE` gets `SQLITE_BUSY` rather than blocking; a rollback-journal reader sees the old
  value; a WAL reader is not blocked and still cannot see the uncommitted write; and a second writer
  is refused under WAL too, **because WAL removes the reader-writer conflict and not the
  writer-writer one**. That asymmetry is the teachable thing and it cost no dependency. It shipped as
  `depot-scan-sqlite` and `class-places-sqlite`, one for the error you get and one for the wrong
  answer you get with no error at all. The general form: before concluding a lesson is unreachable,
  check what the tools already on disk actually do rather than what they are usually used for.

- **ADR-0018 — The gate for shipping a page or a workout is the safety net and the citation policy, never
  completeness of its section.** A section is never finished, and a page at a time is a fine pace.
  Waiting for a section to be whole would mean nothing ships.

- **ADR-0019 — Non-executable material is graded by keyword groups on the existing explain grader.** System
  design and behavioural questions do not fit checkpoints, and the alternatives were a self-review
  rubric or leaving them as reading with prompts. The explain grader already existed and still gives
  a verdict, which is what makes the material a rep rather than an article.

- **ADR-0020 — Hints are earned per attempt cycle, not owned for good.** Solving clears them, so the review
  weeks later opens with none showing. Keeping them made the ladder decorative: a problem you had to
  unlock three hints for came back with those three hints on screen, which is a reading rather than a
  review. Two details decided where the clearing goes. It is not on open, because `solved` is sticky
  and a failed review would have its newly earned hint wiped on the next page load. And the response
  to the answer that solved it still lists the hints that cycle earned, because blanking the panel at
  the moment you got it right looks like a bug. Re-earning works the same way it did the first time,
  by getting the attempt wrong.

- **ADR-0021 — `dsa-patterns` stays out of the daily queue.** DSA is a separate track you enter on purpose,
  through focused practice or a scoped session, not something the morning round-robin deals you. The
  mechanism is `OPT_IN_CATEGORIES` in `packages/shared` and one filter in `queue()`, and what it
  holds back is only what you have never touched: name the category in a scope and you get the whole
  thing, while a rep you have attempted or skipped is dealt like any other from then on. Once a scope
  could name several categories, naming became "the list contains it", never "the list admits it":
  an empty list admits everything and names nothing, so scoping to a difficulty still holds the track
  back. The two questions are `scopeNames` and `inScope`, kept apart deliberately, because a queue
  that answered this one with `inScope` would deal 33 untouched DSA reps into an ordinary morning. That second
  half is not a courtesy. Review mode and the dashboard's missed count run the same predicate, so an
  opt-out that also hid attempted reps would leave the app counting misses it then refused to serve.
  The due queue needed no filter at all for the same reason: everything in it was solved, so every
  row is a rep you already chose.

- **ADR-0022 — `api-design` was cut as a category because four fifths of it had already shipped inside
  `http`.** The row asked for twelve reps on offset against cursor, idempotency keys, versioning,
  rate limit algorithms and status codes. An audit before writing any of them found three pagination
  reps, four idempotency reps and four rate-limit reps already live, spread across `http`, `systems`
  and `security`, plus two on status codes. Only versioning had nothing, which showed as
  `apis/versioning.md` citing three reps that are not about versioning. So five versioning reps went
  into `http` alongside the rest of the material, and the category was never created. The general
  point is the one the deck table made: **a queued row names a container, and the material can arrive
  in a different one.** A category is only worth creating when the reps have nowhere they already
  belong, which is what made `logic` worth creating the same afternoon.

- **ADR-0023 — A posture is a tag, not a category, and the twelve reading reps are why.** A rep about what a
  `LEFT JOIN` condition does belongs in the SQL queue whatever shape the question takes, so a
  `reading` category would have moved twelve reps out of the queues that should deal them. The axis a
  category cannot express is the one that cuts across categories, and that is what a tag is: the
  suite refuses a tag whose reps all sit in one category, because that tag is a category wearing the
  wrong hat. The essentials path was the other candidate vehicle and was refused on the format's own
  rules; that argument is under the path below.

- **ADR-0024 — Tags do not change the morning, and that is the point.** The unscoped queue keeps dealing tagged
  reps in their categories, because interleaving is what retention wants. A tag is an entrance, so
  what shipped is a scope the queue, the session builder and focused practice all respect, plus one
  tile that enters it. The rule that keeps tags from becoming keywords is whether somebody would
  deliberately spend fifteen minutes on one; the suite enforces the weaker half of that by refusing a
  tag with no reps behind it, because an entrance to nothing is worse than no entrance.

- **ADR-0025 — Tags and the `dsa-patterns` flag stayed two mechanisms after being designed together.** They look
  alike and are opposites: a tag is opt-in, naming a slice you enter deliberately, and the category
  flag is opt-out, removing a category from a round robin that would otherwise deal it. Collapsing
  them would mean either every category becomes a tag, which is a rename, or the opt-out rides on a
  tag nobody would ever scope a session to. What they do share is the filter chain in `queue()`,
  which is where the second one went.

- **ADR-0026 — One JSON column, not a join table.** Every query that reads tags already loads the whole problem
  set into memory and filters there, so a join table would have bought nothing and cost a table, a
  migration and two more inserts per seed. The column is parsed defensively: a tag this build does
  not know is dropped rather than crashing the queue that contains it, so an older binary can read a
  newer seed.

- **ADR-0027 — No model runs anywhere in the AI engineering material.** Every problem is about the code around
  the dependency, which is the part that fails in production and the only part that can be graded
  deterministically offline. A problem that needs an inference call to grade is a problem this
  project will not have.

- **ADR-0028 — Pairing between reading and reps is a floor, not a scoreboard.** The target is that no page is
  unpractised and no substantial category unexplained, not a matching count on either side. A
  problem carries its own lesson in its explanation, so an uncited problem is not a debt, and the
  queue should never be reordered to drive a number to zero.

- **ADR-0029 — `node` and `sql-performance` became categories rather than more `systems` and `sql` reps.** Both
  were already named as categories on the roadmap, but the cheaper option was real and was declined:
  `sql` had forty-six reps and could have absorbed nine more. What the split buys is the round robin.
  A category is the unit the daily queue deals from, so material folded into `sql` competes with
  every other SQL rep for a morning slot and effectively never comes up, while a category of its own
  is dealt in its own right. The same argument put the runtime beside `systems` rather than inside
  it: `systems` is about the shape of a system and `node` is about the process running it, and a
  reader wanting one is not asking for the other.

- **ADR-0030 — "Filter before joining" was specified as a `sql-performance` rewrite and cut, because it is not
  one.** The roadmap named it alongside `EXISTS` against `COUNT` and keyset pagination, and it turns
  out to be folk advice: on SQLite, filtering inside a CTE and filtering after the join produce
  byte-identical plans, because the planner pushes a plain predicate down without being asked.
  Capturing both plans is what settled it, which is the engine-honesty rule in `content.md` paying
  for itself on the first rep that tested it. What shipped instead is `sqlperf-limit-before-join`,
  where the barrier is real: an `ORDER BY … LIMIT` applied before the join genuinely changes the
  plan, because a limit is not a predicate and cannot be pushed through one. **The general lesson is
  the one worth keeping: a rewrite earns a rep only once the two plans have been captured side by
  side.** A rewrite that everybody repeats is exactly the kind that has stopped being true.

- **ADR-0031 — A graph in `dsa-patterns` is a plain object of named nodes to arrays of named nodes**, and every
  node is a key, leaves included: `{ home: ['docs', 'blog'], docs: ['api'], api: [], blog: [] }`.
  This was settled before the BFS and DFS wave was written rather than by it, because a `js-code`
  starter has to commit to one shape and the wave would otherwise have decided for everything after
  it. The alternatives were a `Map`, an edge list and a grid.

  What decided it is smaller than the design question and not recoverable from the code: **integer-like
  keys are not insertion-ordered.** JavaScript hoists them ahead of string keys and sorts them
  ascending, so `{ '2': [...], '1': [...] }` iterates `1, 2` whatever order it was written in, and
  `{ b, '2', a, '1' }` iterates `'1', '2', 'b', 'a'`. A breadth-first answer is neighbour order made
  visible, so numeric node ids would make the expected output an artefact of what the nodes were
  called. **Node ids are therefore non-numeric strings, always**, and a fixture lists each node's
  neighbours in the order a traversal should visit them.

  Writing the first wave against this narrowed the second half of that rule. **Neighbour order is
  load-bearing only where the rep's output is itself an order**: a shortest distance, a reachable
  set and a yes-or-no on a cycle are all invariant under permuting the lists, so there it is a
  readability convention and a prompt should not claim otherwise. `dsa-reachable-nodes` returns the
  visit order deliberately, so that the convention is actually tested somewhere.

  The rest follows the grain already set by the linked-list reps, which hand you `{ value, next }`
  and a builder in `setup`. A `Map` is what you build from a graph, not what you are handed: a graph
  that arrives over the wire is JSON, and a `Map` in a test would also force `expectedCode` on every
  assertion, which trades a readable diff for nothing. Every node appearing as a key, including the
  ones with no edges, keeps "has no neighbours" and "is not in the graph" from being the same
  lookup, and a rep that wants that distinction has to say so.

- **ADR-0032 — Bytes against characters was audited for a page and refused.** Two `node` reps share the model,
  which is normally what earns one. The half that costs you in production is already written and
  written well: `ai-engineering/streaming-a-model-response.md` opens on "a stream is bytes, and you
  have to put the message boundaries back", its worked example is the `{ stream: true }` decoder, and
  its first trap is the chunk boundary. A Node page would put one model in two places. What is left
  over is that `Content-Length` counts bytes while `String#length` counts UTF-16 code units, and that
  is a fact you would look up, so its traps section would be one symptom restated. The other UTF-8
  mentions in the handbook are passing references in service of another subject and none of them is
  failing for want of this page. The reps are cited from the pages that own their halves instead.

- **ADR-0033 — The memoisation wave was written after the roadmap predicted it would be written badly, and the
  prediction is what shaped it.** The row warned that climbing stairs and house robber teach a `dp`
  array that appears from nowhere, and authorised cutting the wave. What shipped instead clears the
  bar mechanically rather than by assertion: for each of the three reps the plain unmemoised
  recursion passes every small test and hits the grader's one-second timeout on exactly one, so the
  naive answer cannot pass. Measured naive runtimes were 34s, 7.4s and 5.6s against under a
  millisecond memoised. **The generalisable part: where a lesson is about cost rather than
  correctness, find the input that makes the slow answer fail rather than describing the cost in the
  explanation.** Tabulation is named in two explanations as what you convert to once the recursion is
  right, and refused as a rep of its own. Climbing stairs, house robber, knapsack and edit distance
  were each rejected by name, the first three because the recursion is not anybody's first answer and
  the last because it is a second two-dimensional rep beside `dsa-grid-routes`.

- **ADR-0034 — The BFS queue discipline is not gradeable by a distance test, which decides where that bug can
  live.** Marking a node visited on dequeue rather than on enqueue is the classic mistake and it does
  not change a single shortest-path answer: it queues a node twice, wastes work, and still
  terminates with the right number. It becomes an observable wrong answer only where the output is
  the visit order or the node list, which is why that bug is what `dsa-reachable-nodes` tests and why
  `dsa-shortest-hops` carries a depth-first bug instead. Worth knowing before writing the next graph
  rep, because the natural assumption is that a distance test covers it.

- **ADR-0035 — Grids stay out of the graph reps, and trees are not graph reps.** A grid's only real difference
  is that neighbours are computed rather than looked up, which teaches bounds-checking rather than
  traversal, and islands and flood fill are the two problems that make this category look like
  interview prep rather than practice. The one thing that would reverse it is a rep whose lesson is
  precisely that a graph is anything with a neighbours function, which is worth writing once and
  never twice. A tree is `{ value, children }`, consistent with `{ value, next }`, and it is a
  separate shape on purpose: no visited set, because the thing that makes a graph traversal a graph
  traversal is the cycle it has to survive.

- **ADR-0036 — `EXISTS` against `COUNT(*) > 0` is a real rep whose lesson the plan cannot show.** Both forms
  plan as the same correlated subquery, so the rep would have been unteachable on its stated terms.
  It survives because the difference is visible one level down, in the bytecode: `EXISTS` jumps out
  of the inner loop on the first match where the count aggregates every row and then compares. The
  rep says so, and says the plan will not show you this. Kept as a note rather than a refusal because
  the next author to reach for a plan will otherwise conclude the rewrite does nothing.

## Workouts

- **ADR-0037 — Workouts run server-side against the real toolchain.** A browser sandbox cannot run a real ORM,
  which defeats the purpose. Each workspace symlinks its `node_modules` at `packages/workouts`, so a
  workout imports the real drizzle-orm with no install per attempt and no network.

- **ADR-0038 — A workout declares its stack as free text in the manifest.** That is what lets the same brief
  ship against four different ORMs as four separate workouts, which is the case the format exists
  for.

- **ADR-0039 — Checkpoints are one test file each and are not gated on each other.** Status is "did every
  assertion in that file pass", which is what makes a 20-minute exercise honest: at ten minutes, two
  of four green tells you something real. A strict mode that gates later checkpoints on earlier ones
  has been raised and not taken.

- **ADR-0040 — A brief states the symptom and never the cause.** Working out what is wrong is the exercise, so
  naming the diagnosis deletes the part worth doing. It is the easiest mistake to make, because by
  the time you write the brief you know the answer.

- **ADR-0041 — The flaky checkpoint suite was fixed in the content, not by slowing the runner.** One workout
  failed `pnpm verify` roughly one run in three, on a different checkpoint each time and never in
  isolation, which is the signature of load rather than a bad assertion. The cause was `request(app)`:
  supertest binds a fresh ephemeral port per call, and the suite looped ten revalidations, so the
  outer suite left hundreds of ports in `TIME_WAIT`. The obvious fix was to serialise the nested
  vitest, and it was measured and rejected: `--no-file-parallelism` took a workout run from **0.70s to
  1.08s**, and that is the path somebody sits through every time they press Run. Paying 55% in the
  loop to stabilise a gate is the wrong trade when the gate's problem is a socket per assertion. The
  suites now bind one listener per test. The same shape was applied to the rate-limit workout, which
  loops a request per unit of allowance and had the same exposure without having failed yet.

- **ADR-0042 — The diff is hand-written, and it is a third view rather than a replacement for the reference.**
  Fifty lines of LCS over lines, because a diff library would sit in the runtime bundle forever to
  compare two files of a few hundred lines, and the shadcn components are already hand-written on the
  same reasoning. Three views and not two: Mine, Diff, Reference. The toggle it replaces was a reveal,
  and reading two files in turn is not comparing them, but the plain reference is still what you want
  when the diff is large enough to be noise. The reference ships only the files it changes, so a file
  it leaves alone says exactly that instead of rendering as an empty side.

- **ADR-0043 — A single-checkpoint run says what it did not check, rather than quietly keeping the old ticks.**
  Running one suite while iterating on it is the point of the feature, and the trap is what happens to
  the other three rows in the panel. Blanking them to not-run throws away the picture you were working
  from; leaving them green claims a verification nobody performed, which is the one lie a checkpoint
  panel cannot afford. So they carry their previous result forward with `stale` set, dimmed, captioned
  "Not re-run just now", and two numbers refuse to count them: `passedCount` only counts what the run
  itself verified, so a one-checkpoint run can never raise your best score, and the reference unlocks
  only on a full green run of the whole suite. That last rule is why `WorkoutRun` records which
  checkpoint it ran rather than inferring it from the counts.

- **ADR-0044 — The two systems workouts stayed two.** They were queued with permission to merge if writing them
  proved they were one, and they are not: a circuit breaker is a state machine over failures, and
  single-flight is deduplication over concurrency. They share a fake clock and nothing else. The
  overlap that remains is with the queued "Cache the expensive report", which is cache-aside in an
  Express handler; the dedupe primitive underneath it is now `one-recompute-not-fifty`, so that
  workout is about where the pattern goes wrong around a route rather than about the primitive.

- **ADR-0045 — A checkpoint never waits out the suite timeout to learn a call is stuck.** Both clock-driven
  workouts assert on "has this settled by now" through a helper that races the call against a few
  macrotask ticks. Without it, a starter that never times out anything spends ten seconds per
  assertion, and a 25-minute exercise pays half a minute for every run of its checkpoints.

- **ADR-0046 — Performance is judged by what the code asked the database for, never by a stopwatch.** A timed
  assertion would be flaky. Asserting on statement counts, rows returned and the `EXPLAIN` of the
  query actually sent makes the failure message the teaching, and it separates an index that exists
  from an index the planner chooses, which is the distinction the exercise is about.

- **ADR-0047 — That rule binds this repo's own suite too, and `workouts.spec.ts` was breaking it.** The proof
  that running one checkpoint beats running all four was `one.durationMs < full.durationMs`: two
  wall-clock measurements taken minutes apart, on a machine also running the rest of `pnpm verify`.
  It inverted repeatedly (4000 against 3583, 4275 against 3155) on whichever workout happened to sort
  first, so every red run had to be triaged before it could be dismissed. A wider margin would only
  have made it rarer. The run already carries a count of the work it did, because vitest's report
  gives every checkpoint its test total and a carried-over result is flagged `stale`, so the
  assertion is now that a one-checkpoint run executed fewer tests than a full one. That is the
  mechanism rather than a proxy for it: what `only` does is hand vitest one suite instead of every
  suite. **Nothing in this repo asserts on elapsed time**, and a contract that seems to need it is a
  contract with a countable version nobody has looked for yet.

- **ADR-0048 — Fakes keep the awkward semantics of the real thing.** The fake Redis is worth having because
  `incr` creates a key with no deadline, and because `ttl` answers -1 for "no deadline" against -2
  for "no key". A fake that smoothed those over would teach an API that does not exist.

- **ADR-0049 — Anything time-dependent gets a fake clock rather than vitest's fake timers**, which fight
  supertest's sockets and `userEvent`. The fake Redis carries an `advanceTime` the real thing has
  not, which is how a checkpoint waits out a sixty-second window for free.

- **ADR-0050 — The offline constraint forced three substitutions, and all three improved the exercise.** A
  local fixture endpoint replaced a public JSON API and gained fault injection and a per-query
  delay, which is what turns a race into something a checkpoint can assert on. PGlite replaced
  Postgres and gives real `ILIKE` and real `EXPLAIN` in-process. The Redis fake replaced Redis.

- **ADR-0051 — The scaffold's server project transforms with SWC, not esbuild.** Nest and TypeORM read
  constructor parameter types back at runtime through `design:paramtypes`, and esbuild emits no
  decorator metadata at all, so injection silently resolves to `undefined`. The failure is a
  confusing null rather than a build error. The client project stays on esbuild, which is faster and
  needs none of it.

- **ADR-0052 — The scaffold picks a test environment with two vitest projects, not `environmentMatchGlobs`**,
  which vitest deprecated in 3.2.

- **ADR-0053 — Prisma is not a workout stack.** `prisma generate` is a build step in a package that
  deliberately has none, and there is no PGlite driver adapter for it, so one would have to be
  written against Prisma's adapter API. Both are solvable and neither is worth it for one workout.
  TypeORM and Sequelize connect without codegen.

- **ADR-0054 — Mongo and Mongoose were deferred, and half that argument has since been dropped.** The entry
  read "they need a real server or a heavyweight memory-server dependency, and no brief so far
  demands a document store". The first half no longer disqualifies anything: a workout may require a
  binary this repo does not ship, provided it declares it and skips cleanly when absent. **The second
  half stands and is now the whole test** — a document store waits for a lesson that needs one,
  which is the same bar `ws` is still waiting on and `zod` cleared. Modelling for access patterns is
  the candidate, and it is a page before it is a workout.

- **ADR-0055 — A GraphQL server workout was deferred until the transport pages existed**, so its brief would
  have somewhere to link. The N+1 that GraphQL invites makes a good bug-hunt, and the dependency is
  now in place.

- **ADR-0056 — React Native and desktop workouts are refused.** Web is the stated priority, and the platform
  cannot checkpoint native targets. That machinery does not get grown speculatively.

- **ADR-0057 — New dependencies are raised as a batch and taken as decisions.** `graphql`, `react-window` and
  `zustand` were decided together rather than one at a time, precisely so the question got answered
  once. A dependency is the one part of a workout that is not just a directory, so adding one stays
  a decision rather than a reflex.

- **ADR-0058 — Shared workout helpers wait until the variation is visible.** Two workouts each log the
  statements their ORM runs, and the shapes differ enough that folding them into one helper at n=2
  would be guessing. Anything shared has to live in `scaffold/`, which is copied into every
  workspace, so it becomes part of the authoring contract rather than an implementation detail.

- **ADR-0059 — The same reasoning released `pnpm workout <slug>` once the variation was visible, and reading 26
  workouts is what decided its shape.** At n=15 a generator would have been guessing; at 26 the
  invariants are countable. All 26 share the five-part layout, a `solution/` holding exactly the
  `editable` set, checkpoint suites numbered in manifest order, and a brief whose h1 matches the
  manifest title byte for byte. Two of those are enforced nowhere and are exactly what a generator
  gets right for free. **What varies is one axis**, where the code lives, which decides the starter
  shape and whether the suite drives HTTP; everything else, five databases and four fake clocks
  between them, is per-workout and templating it would be a wrong guess wearing the authority of a
  decision. So the tool takes a stack and a file name and emits the skeleton, and stops.

  **A freshly scaffolded workout fails `workouts.spec.ts`, once, naming itself.** Its solution is its
  starter, so the safety net says a workout with no content in it is not finished. A green stub would
  buy a green suite by making the net say something untrue, and a half-written workout would then
  ship without a word.

- **ADR-0060 — Workspaces are disposable.** The directory for an attempt is deleted when the attempt finishes,
  and anything worth keeping goes in the database.

- **ADR-0061 — Easy workouts are their own shape, not shortened medium ones.** The library reached ten workouts
  with nothing under twenty minutes, so nothing fitted the session the rest of the app is built
  around and the whole content type sat behind a wall. A medium workout asks you to build a thing;
  an easy one asks you to get one thing right.

- **ADR-0062 — Three queued workouts were cut on audit rather than written.** Its first row is
  superseded by ADR-0146; the other two stand. **The migration that locks up**
  named a lesson the engine cannot show: PGlite serves one in-process connection and the Kysely
  dialect holds a single `DatabaseConnection`, so there is no second session for a long lock to
  block, and what is left is asserting on the shape of the DDL rather than on behaviour. A database
  in the workout set that serves two connections would reverse it, and nothing else wants one.
  **Accessible data table** was a rep and a citation: `records-sorting-drizzle` already builds the
  sortable, paginated table, `autocomplete-react` owns the keyboard and aria layer, and
  `html-table-caption-scope` is already a rep, so the row amounted to three attributes on somebody
  else's work. A grid where the a11y is the hard part, with a roving tabindex and an interactive
  cell, is a different row and has no page yet. **Search that ignores accents** was the product-search
  brief a second time, and the audit that found it left two exits open; the one that moved it off
  product search has stood empty since, which is the answer. Accents are a section on
  `databases/search-past-like.md`. A uniqueness constraint that lets José and Jose both register is a
  real bug and a different brief.

- **ADR-0063 — A queued row's infrastructure claim ages the same way its stack does.** The workout queue said
  its rows ran on infrastructure that already exists, and two of them leaned on that. The fake Redis,
  the driven clock and the fixture API are each one workout's own file: `materialise` copies
  `scaffold/` and then that workout's `files/`, so the next workout copies and adapts them. The
  fixture API in particular injects a per-query delay and not a fault, which is what a retry exercise
  would have needed. Check what a row assumes exists, not only what it assumes is available as a
  dependency.

- **ADR-0064 — A workout declares two things about its test run and is handed neither a config file nor a
  default.** It used to declare nothing: `scaffold/vitest.config.ts` was the only config a workspace
  had, so assertions ran in the reader's zone and a dated workout could not reach the DST boundary
  that is usually its lesson. The obvious fix, letting a workout ship its own `vitest.config.ts`,
  was rejected. That config decides `include`, the timeouts and the reporter, which is to say it
  decides whether a checkpoint is capable of failing, and a workout that owns it can pass its own
  suite by configuring the failure away rather than by fixing anything. So the manifest carries an
  optional `testRun` with a `timezone` and one `setupFile`, and the runner translates the pair onto
  the spawned process as `TZ` and `HONE_SETUP_FILE`. The scaffold config reads the second and merges
  it into both projects. A workout still cannot name a suite, widen a timeout or change how results
  are reported.

- **ADR-0065 — The zone is set before the vitest process starts, not from inside the run.** Assigning
  `process.env.TZ` in a setup file was measured and does move `Date` immediately on macOS and Node
  24, so it looked like it would collapse the surface to one field. It is process state, and the
  reason not to rely on it is what happens when a worker is reused: with `--no-isolate` and one
  worker, a suite that set `Pacific/Kiritimati` handed that zone to the next file in the same pid.
  The scaffold's defaults give every file its own child today, so nothing leaks, but a workout would
  then be depending on an isolation setting it does not own and cannot see. Setting `TZ` on the spawn
  is correct whatever the pool does later.

- **ADR-0066 — A mis-spelled zone is refused rather than run.** `Intl` matches a zone name case insensitively
  and `TZ` matches the zone database as spelled, so `America/New_york` does not fail: it yields a
  fixed offset with no DST transition, and a workout about the boundary loses the boundary without
  anything going red. The loader canonicalises the declared name and refuses it if the spelling
  changed, which costs a legitimate alias like `Etc/UTC` its name and is worth it.

- **ADR-0146 — The migration workout is back, and what PGlite could not show turned out to be two
  facts rather than one.** Supersedes the first row of ADR-0062, which cut it and named its own
  reversal condition: a database in the workout set that serves two connections. `requires` and a
  real Postgres met it, and `orders-migration-postgres` shipped.

  The reversal is worth more than the row. The cut assumed the missing thing was a second session to
  block, so a checkpoint would have to time a wait. Neither half held. **The rewrite is visible
  without a clock**, in `pg_class.relfilenode` before and against after, which is the fact a
  stopwatch was only ever a proxy for. **And the lock queue refuses a reader whose own lock
  conflicts with nothing held**: a plain `SELECT` needing `ACCESS SHARE` is turned away with `55P03`
  because the migration's ungranted `ACCESS EXCLUSIVE` request sits in front of it. That is the
  lesson, it is a state rather than a duration, and a checkpoint asserts it by polling `pg_locks`
  until the queue exists rather than by waiting a measured number of milliseconds.

  Measured on 17.10 over 200,000 rows, and the reason the row is worth a workout at all: the PG 11
  fast path covers a default that can be evaluated once and stored in `attmissingval`, so
  `DEFAULT 'GBP'` and `DEFAULT now()` are catalog-only at under a millisecond, while a **volatile**
  default like `gen_random_uuid()` still rewrites the whole table. "Postgres fixed that years ago" is
  what everyone remembers, and it is half true, which is the trap.

  **The general form, and the reason this entry exists rather than a quiet edit:** a cut that names
  its reversal condition is worth far more than one that does not, and the condition being met is not
  the same as the original reasoning having been right. Re-derive the lesson when the condition
  arrives.

- **ADR-0147 — A requirement names a binary, a port, or both, and never neither.** Supersedes the first
  bullet of ADR-0006, which made `binary` required and `port` optional. That shape was written with
  no workout using it, and the first one that did found it backwards within an hour: what
  `orders-migration-postgres` needs is something speaking the Postgres protocol on 5432, and
  `postgres` on `PATH` is neither necessary nor sufficient for that. Postgres.app and a container
  both serve the port with nothing on `PATH`, and the declaration passed here only because Homebrew
  symlinks the binary. **The rule that replaces it is that the field follows the dependency**: a tool
  you shell out to is a binary, and a daemon you connect to is a port.

  Making both optional would have been the smaller change and is not enough, because it admits a
  requirement naming nothing, which is met on every machine and means nothing on any of them. So the
  loader refuses that shape and the shared type refuses it at compile time, as a union of "binary
  with an optional port" and "port alone".

  The messages are the reason this is not a one-line loosening. There were two, distinguishing "not
  on your PATH" from "installed, but nothing is listening", and that distinction is the whole value
  of asking two questions rather than one. A port-only requirement needed a third sentence of its
  own, and what it must not do is mention `PATH`: telling somebody whose Postgres runs in a container
  to install it sends them after a second copy of what they are already running. **A check that can
  answer "missing" in more than one way owes each answer a sentence somebody can act on**, and adding
  a case to the check means adding a case to the prose.

- **ADR-0148 — The declared port is the port the suites connect to, and the runner joins them up without
  knowing what a Postgres is.** `requires` said 5432 while the workout's `db.ts` honoured `PGPORT`,
  so a shell with `PGPORT=5433` in it proved presence on one port and connected to another, and the
  failure read as the exercise being wrong. Three ways out were considered. Making the workout stop
  reading the environment fixes this workout and leaves the next one to rediscover it. Teaching the
  runner to set `PGPORT` puts a Postgres-shaped special case in the one file that runs every workout,
  and the second daemon would want `MONGODB_URI` beside it. What shipped is the same translation
  `testRun` already gets: the runner writes every declared port onto the spawned process, in
  declaration order, as `HONE_REQUIRED_PORTS`, and the workout decides what to do with a number.

  Written every run and empty when nothing is declared, exactly as `HONE_SETUP_FILE` is, because the
  bug being fixed is an ambient value reaching a run that never asked for one. The host needed no
  variable: presence is checked on loopback and only on loopback, so a workout reaching anywhere else
  is reaching the network. **What the environment still answers is who you connect as**, which no
  requirement speaks to, so `PGUSER`, `PGDATABASE` and `PGPASSWORD` are still read.

  The general form is worth more than the variable: **where a declaration is checked in one process
  and used in another, the value has to travel, or the two drift apart silently and the drift looks
  like the content being wrong.**

- **ADR-0149 — `pnpm workout` emits `requires` only when asked, and that is the same principle as the four
  mandatory flags rather than an exception to it.** `kind`, `minutes`, `difficulty` and `relevance`
  are arguments because JSON cannot hold a TODO and a median would ship as an answer nobody gave.
  `requires` decides whether the workout runs at all, which sounds like the same case and is not: its
  usual answer is "nothing", and an absent field is exactly how a manifest says that. A mandatory
  flag would ask 34 authors to say "no daemon" so that one could say "Postgres", and an emitted stub
  would be the plausible guess the scaffolder exists not to make.

  So `--requires postgres:5432`, `--requires 5432` or `--requires postgres`, repeatable, and nothing
  at all otherwise. The flag carries the half a machine can check and the loader is what validates
  it; `install` and `reason` are prose and come out as TODOs, which puts them in the count and in
  `grep -rn TODO` with every other decision left to the author. The tool also says out loud that a
  declared requirement skips rather than fails, because that is the one way a fresh scaffold's
  deliberate red goes quiet: ADR-0059's failure that names the slug never appears if the machine
  cannot meet what the manifest just declared.

- **ADR-0153 — The runner is the content safety net, so there is no version of this project without
  it.** `workouts.spec.ts` imports `runCheckpoints` from `workout-runner.ts` and drives every workout
  twice, once from `files/` and once from `solution/`, which is the whole of "winnable and not
  already won". So the runner has two jobs and only one of them is serving a page.

  Recorded because the second job is invisible from outside. "Could the workout endpoints go away"
  reads like a question about delivery and is a question about whether workout content stays safe to
  edit, and the two have opposite answers. Anything that deletes the Node runner also deletes the
  only thing standing between a broken workout and somebody meeting it mid-practice, which is the
  failure `workouts.spec.ts` exists to make impossible.

  The general form: **a suite that drives the runtime rather than reimplementing it makes that
  runtime load-bearing twice, and the second load is the one nobody remembers when scoping its
  removal.**

- **ADR-0159 — `outbox-relay-node` is the relay, because the consumer and the writer were already
  built.** A workout was proposed for "a resilient consumer": redelivery, a visibility heartbeat, a
  dead-letter queue after N attempts. That is `queue-consumer-node`, checkpoint for checkpoint, and
  the proposal was made from the subject matter rather than from the inventory, which is the exact
  failure `CLAUDE.md` warns about under completionism. **The check to run first is the workout list,
  not the page.** What survived the check is the producer half: nothing moves a committed outbox row
  to a broker. It deliberately overlaps `approval-log-sqlite`, which owns the writer and proves an
  order and its log row commit together, and the overlap is handled by *giving* the learner that
  half in `db.ts` with a comment saying it is already correct, so the twenty minutes go on the part
  that is new. The starter passes checkpoint one and fails the other three, which is the shape the
  brief describes: the happy path works, which is why this ships and why the symptom is four orders a
  month rather than an outage. One checkpoint was cut during authoring rather than faked — "another
  writer gets through while the broker is slow" cannot be shown on one better-sqlite3 connection, and
  the honest version is `db.inTransaction` observed at publish time.

- **ADR-0165 — A checkpoint may generate its own documents, and `json-parser` is where that starts.**
  Every checkpoint until now asserts on inputs an author chose, so what a green tick claims is
  bounded by what the author thought to try. The fifth checkpoint on `json-parser` asserts a property
  instead: for any text, the submission and `JSON.parse` either both refuse it or both return the
  same value. Inputs come from a seeded generator, half of them valid documents and half one edit
  away from valid, and a counterexample is shrunk by delta debugging before it is reported.

  **It was measured rather than assumed, by planting five realistic bugs in the reference.** Four
  of the five pass all four hand-written checkpoints and only this one catches them: an unknown
  escape returned as its own letter, a raw control character accepted inside a string, `\u` read
  with `parseInt` so `"\u00tf"` becomes `\u0000`, and a slash silently dropped from a string. The
  reports name documents of two to eight characters, which is what the shrinker buys: `"\x"` for
  the escape, a bare `02` for the number grammar.

  Four things about the shape were decided rather than fallen into:

  - **The oracle is a built-in, and that is why this workout went first.** Everywhere else the
    oracle would be `solution/`, which `workspace.ts` deliberately does not materialise. Handing a
    workspace its own reference implementation is the one thing a workout can never do, so the
    second one of these needs an answer that question does not have yet.
  - **Seeded, never sampled.** Nothing calls `Math.random`, so a failure reproduces on the next run
    and on someone else's machine. A checkpoint that fails one run in five would be worse than no
    checkpoint, and this is the same reasoning as ADR-0047 applied to inputs instead of to time.
  - **The property covers refusals, not only values**, which is the half examples test worst. All
    four bugs it uniquely catches are documents the submission accepts and JSON does not.
  - **It adds no rules to the exercise.** Everything the checkpoint enforces was already written in
    the brief, and the brief now says the checkpoint exists and what it prints. A generated
    checkpoint that tested something the brief never stated would be a gotcha, which is the failure
    mode this format has and the only one worth guarding.

- **ADR-0166 — A checkpoint with no oracle asserts invariants over a trace, and `circuit-breaker-node`
  is the pattern.** ADR-0165 shipped with one question open: `json-parser` got its generated
  checkpoint from a built-in, and no other workout has one. The answer is that a breaker does not
  need something to be compared against, because its contract is a set of rules that hold whatever
  the schedule was. The checkpoint generates the options and a schedule of calls and clock movements,
  records what happened, and reads the rules off that trace. There is no second breaker anywhere in
  it.

  **A model would have been the easy version and is the wrong one.** Reimplementing the state machine
  in the suite and comparing states is a reference implementation under another name: it has to be
  kept in step with the brief, it can be wrong in the same way a submission is wrong, and when it
  disagrees the message says "expected open, got closed" rather than naming the rule that broke.

  **The first draft only caught a breaker acting early, and that is the general lesson.** Every rule
  in it was a safety rule, which is to say nothing may happen before it is allowed. Two planted bugs
  walked straight through: a threshold compared with `>`, so the circuit opens one failure late, and
  a failed trial that does not restart the wait. Both are a machine acting *late*, and no safety rule
  can see late. The fix is the dual, that once the failure streak reaches the threshold and the wait
  is still running the next call has to be refused. **A generated checkpoint over a state machine
  needs both halves, and the safety half is the one you think of.**

  **What it catches that the four hand-written checkpoints do not**, out of nine bugs planted in the
  reference: a trial flag cleared only when the trial fails, and a refusal that restarts the wait.
  Both leave a breaker that never closes again, which is what turns a recovered dependency into a
  continuing outage, and neither shows up on a schedule short enough to write out by hand. The other
  seven are caught by both.

  **The generator is biased, and that is not the same as being a model.** Half the scenarios open
  with enough failures to trip the circuit, because a uniform script spends most of its length
  getting there and every rule is about what happens afterwards. Unbiased, the refusal-restarts-the-wait
  bug took 2000 scenarios to surface; biased, it takes 80.

  **It runs in about 600ms against about 70ms for the other four**, which is the whole reason the
  count is 80 scenarios rather than 500. The cost is the workout's own `Clock`, which spends a
  macrotask on every `advance`, and the fix deliberately not taken is editing `clock.ts`: that file
  is handed to the reader as part of the exercise, and making it cheaper for a suite's benefit
  changes what they are given. Concurrency stays out for a smaller reason, which is that the driver
  runs one call at a time, so "exactly one trial call" is checked by checkpoint four's example and
  not here.

- **ADR-0167 — Seven more workouts have a contract worth generating against, and the other 26 are
  refused with reasons.** ADR-0165 and ADR-0166 each shipped one and left the count open. Reading all
  38 manifests, briefs and checkpoint titles answers it, with the suites themselves read for the
  candidates that survived. The queue is in `roadmap.md`; this is the reasoning and the refusals, so
  the same manifests do not get audited again to the same answer.

  **The bar is not "has an invariant".** Almost anything has one if you squint. It is that the
  contract holds for every input rather than for the ones an author picked, that it can be stated
  without reimplementing the solution, and that the generated version reaches a case the examples
  structurally cannot. Runtime is the fourth test and it is real: the breaker's checkpoint costs ten
  times its other four together.

  **Seven qualify:** `alert-feed-sqlite` (walking every page of a feed that is being written to hands
  over each row exactly once, for any page size and any placement of tied timestamps),
  `one-recompute-not-fifty` (one computation per key per expiry, for any arrival schedule),
  `retry-with-backoff-node` (attempt-trace invariants, the direct sibling of the breaker),
  `queue-consumer-node` (a job that acks never returns, one that does not always does, and neither
  happens twice at once), `class-places-sqlite` (places left equals capacity minus live bookings under
  any interleaving, and never goes negative), `product-search-drizzle` (the only other workout with a
  real oracle, since the match set can be computed in JavaScript), and `records-sorting-drizzle`
  (concatenating the pages gives a total order containing every row once).

  **`alert-feed-sqlite` goes first, and it is a stronger candidate than either workout that already
  has one**, because its property is already written and only its inputs are fixed. `tests/support/walk.ts`
  walks the feed and `repeats` names anything handed over twice; the four checkpoints run exactly that
  on one dataset, at `limit: 20`, with one mutation at page index 0. The bug a fixed page size cannot
  reach is a cursor carrying no id tiebreak, which needs a tie cluster straddling a boundary.

  **Three have the contract and an argument about cost instead**, and they wait behind the seven:
  `outbox-relay-node`, `idempotent-payments-express` and `rate-limit-express` are all real invariants
  driven over HTTP, where the harness rather than the property decides the runtime.

  **The 26 refused, in five groups.** Seven React workouts state their contracts as DOM after an
  interaction sequence, where jsdom and `userEvent` cost per step and a shrunk counterexample reads as
  a list of clicks rather than as a lead. Four are about query count against dataset size, and their
  suites already assert exactly that invariant at two sizes, so more sizes buy nothing. Two are the
  easy twelve-minute workouts, where a fifth checkpoint breaks the shape ADR-0061 defines rather than
  strengthening it. Five are bug-hunts whose contract really is "this symptom is gone", which is a
  narrow solution space that generation does not widen. The last eight have a fixed, small input
  surface — a route table, a token lifecycle, a set of query parameters — where enumerating it is both
  cheaper and more honest than generating over it.

- **ADR-0171 — `dispatch-board-sqlite` is the projection workout, and what it teaches is recompute
  over delta.** ADR-0170 declined one on the grounds that the failure modes were already practised,
  and that was wrong in the way this repo's own bar predicts: the reps make you *name* the failure,
  and none of them makes you build the thing that fails. A read model that has drifted three ways is
  not answerable in a rep, and the board here has drifted all three: a write path that never told it,
  a change the relay delivered twice, and a repair that only puts back what is missing.

  **What separates it from the two workouts it sits next to is the thing worth recording**, because
  the next projection workout will look like a duplicate of one of them. `approval-log-sqlite` is
  atomicity, a change and its log row being one unit of work, and this workout deliberately does not
  retread it: nothing here turns on a transaction. `outbox-relay-node` is delivery, what a relay may
  claim it sent. This one is the projection itself, and all three of its fixes are one idea, that
  **a delta cannot be applied twice and a recompute can**, which is why the checkpoint about a change
  arriving twice is the one that forces the redesign rather than a patch. **The fourth checkpoint
  passes against the starting files**, following `outbox-relay-node`'s first: the tempting repair for
  a board that disagrees with the tables is to stop having a board and join at render time, which
  answers the same question and gives up the reason the table exists. It is a guard rather than a
  fault, and the brief says so, which is what keeps it from being a gotcha. The CQRS page cites it,
  so ADR-0170's page now has the practical half its own worked example argues for.

- **ADR-0174 — The AI fixture is an in-process fake, and "recorded fixture server" in the roadmap was
  the wrong noun.** ADR-0005 permits a loopback process, so a port was allowed rather than forbidden,
  and it was refused on cost instead. Everything the row wanted the fixture to owe is protocol rather
  than transport: a 429 is an error object carrying `retryAfterMs`, a stream that stops mid-object is
  an iterable that stops, an overflowable window is a counter. A port would buy realism nobody is
  graded on and cost a socket lifecycle in every checkpoint of a whole track, which is the
  `request(app)` failure ADR-0041 has already paid for twice. Reopen it where the lesson genuinely is
  the transport, which is the streaming workout: real chunk boundaries may be the thing being taught.

  **A fake may be stricter than the real API only where the real API is strict.** Two checks were
  written and then deleted: that the assistant turn goes back verbatim, and that roles alternate.
  Both would have caught real mistakes, and both would have taught a 400 that does not exist, since
  consecutive same-role turns are combined rather than rejected. ADR-0048 says a fake keeps the
  awkward semantics, and the corollary is that it may not invent them.

  **A fixture that reads your error results is the cheapest way to make "say what was wrong"
  checkable.** Grading an error message usually means asserting on its text, which is a gotcha. Here
  the recorded transcript branches on it: a result naming the offending argument gets a corrected call
  back, and a result of "failed" takes a recorded give-up branch, so the checkpoint asserts on the
  outcome while the quality of the message stays load-bearing. That shape is reusable across the rest
  of the track.

  **The tool-call loop went first of the three** because it is the only one where the fixture's
  semantics are the exercise. Structured-output repair can be practised against a bag of bad strings,
  and an eval harness needs recorded outputs and no loop at all; both of those are a mock object,
  which is what ADR-0048 says is not worth having. The 429 goes with the structured-output workout
  rather than this one: backoff is already `retry-with-backoff-node`'s lesson, and the AI-specific
  half, resending the same conversation without re-running the tools that already ran, is a second
  thing rather than the same one.

- **ADR-0175 — A second-visit ticket has to invalidate a decision part one wrote down, and the
  roadmap's suggested ticket did the opposite.** The row proposed that the outbox "now has to preserve
  order", which part one already guarantees in its brief and enforces in its third checkpoint. What
  produces an exercise is relaxing a guarantee rather than adding one: fulfilment is keyed by order
  now, global ordering is over-strict, and part one's stop-the-pass-on-first-failure, which it argues
  for in a comment and encodes in its outcome type, is what held 900 unrelated orders for six hours.
  **The test is that a part-one checkpoint has to be rewritten, not that a new one can be added.** The
  row's other candidate fails that test: a per-tenant limiter leaves every original checkpoint true
  verbatim, so it extends a design rather than overturning one.

  **The manifest gains no `partOf` field, deliberately.** The relationship is carried by the title,
  the summary and the brief's first paragraph. A link field is a loader, a DTO and a UI for something
  one sentence already says, and it would invite an ordering across the library that nothing else has.

  **A checkpoint that passes from the starter is not slack in the safety net, and the way to prove
  that is to run the obvious wrong fix.** `workouts.spec.ts` requires only one failure, so three
  passing checkpoints is legal. The one that matters here earns its place by going red for the naive
  `continue` that turns another green, which was established by building four candidate
  implementations and running each. That probe should be the standard for every part-two workout,
  because the inherited checkpoints are precisely the ones nobody re-derives.

  **Part one's comments carry over unedited.** The starter arrives arguing for the decision the ticket
  overturns, and neutralising that prose would delete the exercise: the reader has to disagree with a
  written rationale, which is what a second visit is for.

- **ADR-0176 — A refactor checkpoint observes provenance, and both quantities the roadmap named were
  rejected.** A checkpoint observes a program running, and a refactor is defined by leaving observable
  behaviour alone, so a refactor checkpoint that fails from the starter has to observe something that
  is not behaviour, or it is a bug-hunt wearing the label. Statement counts and export-surface size
  both fail that: each is a number the reader moves without moving anything that matters, and the
  first is already the subject of two workouts where the count is the lesson. What works is **which of
  the workout's own files was on the stack when a call reached the outside world**, recorded by the
  fake through V8 call sites. The decisive case is that an import-graph check and a provenance check
  disagree on exactly one move, passing the dependency in as an argument, and a refactor workout is
  only worth having if it fails that move.

  **Prohibitions are one-sided, and that is the ceiling on the kind.** You can assert that code does
  not live somewhere: no import, no frame, no export. You cannot assert that it does, because living
  in a file is not observable at run time. So a refactor workout can force code out of a place and
  never into one, and it has to be built so the only remaining destination is the intended one, which
  here is two editable files with the entry point pinned by a third the reader cannot edit. The
  residual escape, inlining the rules into the caller and leaving a shell behind, is closed by a
  stated constraint and a weak export check rather than by a checkpoint. That is the honest limit of
  the kind rather than something to paper over.

  **A refactor brief cannot withhold the diagnosis, and should not try.** ADR-0040 is written for a
  bug-hunt, where the finding is the exercise, and nobody files "something is wrong, find it" against
  code that works. In a refactor the finding is the ticket, and what stays withheld is the
  decomposition, which is where the twenty-five minutes go. The rule's intent survives and its letter
  does not.

  **It also has to say out loud that it is not a performance workout.** The same fake, the same
  recorded calls and the same failure vocabulary serve both, and a reader who sees a query inside a
  loop reaches for N+1 first. Here the query count is allowed to rise, and one line in the brief is
  what keeps the lesson distinct from the two workouts that count exactly these calls for the opposite
  reason. **The kind itself needed no application code**: `WORKOUT_KINDS` has carried `refactor` since
  the type was written and the loader never validated `kind` at all. Only the UI label moved, from a
  bare noun to a verb phrase, so the three read alike.

- **ADR-0177 — The axis worth generating over is the correlation the author did not notice they were
  holding fixed, and the roadmap named the wrong one.** The row predicted that the bug reachable only
  by generation would be a cursor carrying no id tiebreak; checkpoint 04 already arranges a boundary
  inside a burst and catches every timestamp-only cursor. What a fixed dataset cannot reach is the
  shape of the *fix*: `created_at <= ? AND id < ?`, which reads like the row-value comparison it is
  standing in for and silently drops every older alert whose id happens to be larger. It is invisible
  in the seeded feed for exactly one reason, which is that `createDb` numbers its 630 alerts in the
  order they fired, so no row ever has a smaller timestamp and a larger id. Generation reached it with
  two alerts, no tie and no mutation, and not by varying the page size, which is what the row expected.

  **The liveness half is where the catches come from, again**, which is ADR-0166's finding holding on
  a second workout. "No alert twice" is what a reader thinks of and what the brief's story describes;
  every bug this checkpoint uniquely catches was found instead by "an alert firing throughout the walk
  appeared on no page at all". A duplicate is visible from two pages and a miss is visible from none,
  which is why the second failure in that story ran for forty minutes.

  **A generated checkpoint is expensive because of the workout's own machinery, not because of the
  generation.** The breaker's costs ten times its other four because its clock spends a macrotask per
  advance. This one costs about half of its other four, because the whole cost is SQLite over twenty
  rows on a single connection reused across scenarios rather than re-seeded per scenario. So cost is a
  question to ask per workout rather than a ratio inherited from the breaker, and the six left in the
  ADR-0167 queue should each be costed rather than assumed expensive.

  **One blind spot is recorded rather than chased.** A submission ordering by `created_at DESC` with
  no tiebreak passes all five checkpoints, because SQLite serves that order from the index and ties
  come back by id anyway. Seeing it would mean either editing the non-editable `db.ts` to drop the
  index, which ADR-0166 refuses as a class of move, or modelling the planner inside the suite, which
  is the reimplementation it also refuses. The workout accepts a solution that is right by accident of
  an index, and that is the price of both refusals rather than an oversight.

- **ADR-0178 — The workspace tree is about the files with no tab, not about too many tabs.** The
  roadmap's trigger was that `session-revocation-nestjs` ships eight files under `files/` and a flat
  tab list stops being readable around there. The premise was true and the inference was wrong: the
  strip rendered `attempt.files`, which is `readEditable()`, so it only ever listed the manifest's
  `editable` paths, and the widest workout in the library declares three. There were never eight tabs.
  What the audit found instead is that the other files are materialised into the workspace, imported
  by the checkpoint suites, and unreachable from the UI, while eighteen briefs describe them in prose
  and several tell you to open one: "`src/client/contract.ts` … Read it: it is the specification".
  The workaround was paraphrasing a fake's API into the brief, fifteen lines of it in one case. So the
  row inverts, and the fix is **more** files on screen rather than fewer tabs. **A brief that inlines
  a read-only file's API is now a content smell rather than the only option.** Read-only is
  presentation over the `writeEditable` allowlist that already existed, so nothing about what can be
  typed in has changed.

- **ADR-0179 — A transcript is text the suite already produced, and the type is where that line
  lives.** `WorkoutTranscriptEntry.body` is `string` and nothing else, which is the whole argument in
  one field: a payload object the panel could re-render, or markup an iframe could mount, is a second
  runtime and application work per workout, which is what the roadmap declined and what the library is
  built to avoid. Strings pass through untouched, which is the `prettyDOM` and failure-message path;
  anything else is serialised where it is recorded and truncated there.

  **Record the exhibit, not the haystack.** The content forced this rather than taste: the whole board
  payload truncated mid-JSON at four thousand characters and taught nothing, where a skeleton plus one
  card, beside a complaint naming `columns.0.cards.3.updatedAt`, teaches on sight. Three workouts of
  thirty-nine record anything at all, and that ratio is the expected end state rather than a start.

  **Recording can never decide a checkpoint.** Every error inside `record` is swallowed, and a test
  proves a circular reference, an `undefined` and a function cannot turn a passing checkpoint red. A
  diagnostics call that can fail a checkpoint is worse than printing nothing, because it makes the
  safety net lie about the content rather than about the code.

- **ADR-0180 — Time-to-green needed a column, because the app encourages exactly the runs that destroy
  it.** `workout_attempts` could not answer the question as it stood. `last_run` is overwritten on
  every run, and going green is the moment the workout invites more of them, since the diff and the
  reference only unlock then. `finished_at` is when Finish was pressed, which is after the diff
  review, so it measures time spent in the workout rather than time to solve. `best_passed` says you
  got there and never says when. So `reached_green_at`, written once, on the first full-suite green.
  **This is the same shape as the session-outcome snapshot rule**: a derived value looks free until
  the write path that clobbers it turns out to be the one the feature encourages.

  **First green wins, and a partial run never counts.** Going green, breaking it and fixing it took as
  long as it took the first time. And a single-checkpoint run cannot set the timestamp for the same
  reason it cannot unlock the solution, which makes "a partial run that totals up to everything has
  not proved the same thing" one rule governing two things rather than two conditions that happen to
  agree.

- **ADR-0181 — The axis was the correlation again, and the roadmap has now named the wrong one twice.**
  ADR-0167 predicted "one computation per key per expiry, for any arrival schedule". Arrival schedule
  is the parameter the story is about, fifty people opening one dashboard, and it finds nothing:
  checkpoint 01 already arranges the only arrival that is hard, and fifty callers, five and one are
  the same case. What the four hand-written suites hold fixed without saying so is **the clock, which
  none of them moves while a computation is in flight**. Every one of their computations settles in
  the millisecond it started, so a value dated from when its computation started and one dated from
  when it finished are the same value, and the brief's own sentence about when the deadline is set has
  no test behind it. `const now = this.clock.now()` at the top of `get`, reused for the freshness
  check and the deadline, is the most natural way to write this cache and it is wrong. ADR-0177
  predicted this shape and it held: two for two, the find is a variable the author never thought of as
  a variable, not the one the row names.

  **Cost is predicted by "does this workout drive a fake clock", not by "is it generated".** Measured:
  226 ms of this checkpoint's 245 ms is 182 calls to `Clock.advance`, each ending in a `setTimeout(0)`
  that Node clamps to 1.24 ms on this machine, against 27 ms for the other four combined. The
  breaker's 10x and this workout's 8.5x have one cause and the feed's 0.5x is the absence of it. That
  gives the five left in the ADR-0167 queue a prediction instead of a number to inherit:
  `retry-with-backoff-node` and `queue-consumer-node` will be expensive, the three database ones will
  not. It also decides the driver's shape, which drains microtasks between steps and pays for a real
  macrotask only when a caller is genuinely still unanswered.

  **A generated report has to fit in six lines, and the feed's did not.** `describeFailure` keeps the
  first six non-blank, non-stack lines of a failure, which the breaker's four-line report survives.
  The feed's put the rule that broke last, so a reader saw the header, the page size and three rows of
  seeded data and never reached the reason. Fixed by leading with the rule and letting the
  reproduction be the half that gets cut, which is also what makes shrinking load-bearing in a second
  way: it is what keeps a counterexample inside the window. Handing the full report to the transcript
  panel with `record()` (ADR-0179) is the other available answer and was not taken here, because a
  four-line report in a panel is the same four lines twice.

  **A blind spot can belong to the contract rather than to the checkpoint.** A cache that drops a
  key's stored value when a computation for it fails passes all five checkpoints, and no schedule can
  separate it from the reference: a computation only ever starts for a key with no fresh value, so the
  entry that handler deletes has always already expired. That is different in kind from ADR-0177's
  index-order blind spot, which generation could see if a suite were allowed to reach into `db.ts`.
  This one is unobservable through what `get` exposes, so it is a limit of the surface rather than of
  the generator.

- **ADR-0182 — The third axis was the example set's own uniformity, and the row that named nothing
  was righter than the two that named something.** ADR-0167 described `retry-with-backoff-node` as
  "attempt-trace invariants, the direct sibling of the breaker", which is a shape rather than a
  parameter, and that turned out to be the honest thing to write down. What the four hand-written
  checkpoints hold fixed is not a setting at all: it is **which failure each one uses**. Every wait
  is measured on a run of 503s, every ambiguous failure is a dropped connection, and no suite ever
  changes what the downstream does between one attempt and the next. Four of the eight bugs only the
  generated checkpoint catches live in exactly that seam, and one of them is the brief's own story:
  a client that treats a deadline it fired itself as proof the downstream never ran the request
  sends the charge twice, and passes all four.

  **The other four are of two kinds, and both are cheaper to describe than the seam.** Two are
  scalars nobody thought of as scalars, which is ADR-0181's finding again: the budget never lands
  exactly on a boundary, so `>=` reads the same as `>`, and the clock always reads zero when the
  call is made, so a budget taken from `budgetMs` rather than from `clock.now()` is the same
  deadline. Two are plain holes in an enumeration, since no example sends a 502, a 504 or a DELETE.
  Holes like those are the argument ADR-0167 made for *not* generating over a small fixed surface,
  and they are worth having only because the generator was going to vary the status anyway.

  **So the queue should stop predicting the axis.** Three workouts in, the row has named it wrong
  twice and named nothing once, and the one that named nothing cost nothing to be right about. What
  the remaining rows can usefully carry is the contract and the cost, which are both checkable
  before any code is written.

  **Cost is set by clock movements per scenario, not by the presence of a fake clock.** ADR-0181
  predicted this workout would be expensive on the strength of driving one, and it is 4.5x its other
  four rather than the breaker's 10x or the cache's 8.5x. The reason is that a whole call is four to
  six timers, where a breaker schedule is dozens: the generated scenario here is one `request`, and
  the clock is driven by draining what the client asked for rather than by a script of advances. So
  the predictor is the number of times the clock has to move, and `queue-consumer-node` should be
  costed on that rather than inheriting a multiplier.

  **Two blind spots are accepted rather than chased.** Where a client is both out of attempts and
  holding a failure it may not send again, the brief does not say which reason it should give, so
  the checkpoint accepts either; a client that reports the less useful one passes. And a
  reimplementation was refused where it would have been easiest: the expected wait for a gap is
  computed from the brief's formula and the scenario's own jitter sequence rather than by running a
  second client, which is why the wait rules are checked one gap at a time against what the trace
  says already happened.

- **ADR-0183 — The axis was two things held still rather than one, and dropping the prediction from
  the row is what made that findable.** ADR-0182 retired the roadmap's axis column on the grounds
  that the axis has never been a parameter of the problem. `queue-consumer-node` is the first one
  audited without a guess to defend, and it has two non-parameters rather than one. Every hand-written
  checkpoint runs on the same `{ visibilityTimeoutMs: 30_000, heartbeatMs: 10_000, maxReceiveCount: 3 }`,
  and the single delivery whose ack dies is the first delivery of a job with two more coming, which
  is the one spot where getting the ack's neighbourhood wrong has somewhere to disappear to. Separately,
  all four only read the queue between runs, so nothing ever asks what it is holding while a handler
  is actually running.

  **Ten planted bugs, nine caught by the fifth, four caught by nothing else**, and the four split
  along those two seams exactly. Two are the ack: an implementation that puts `queue.ack` inside the
  same `try` as the handler sends a document it successfully converted to the dead-letter store, and
  one that swallows an ack failure answers `handled` for a job the queue still has. Both are invisible
  at `maxReceiveCount: 3`, and both fall out of a single run once a job can be given one delivery.
  Two are the heartbeat: extending by `heartbeatMs` instead of the visibility timeout, and beating
  once per visibility timeout rather than per heartbeat, each leave the job grabbable at every beat
  and each pass all four hand-written checkpoints.

  **The handler is what does the looking, which is how the second seam became checkable at all.**
  Nothing outside can observe the queue mid-`advance`, so the generated scenario hands in a handler
  that reads `queue.inFlight()` at every step it wakes on. That is the brief's own "no second worker
  gets a job that is still being worked on" read continuously instead of once, so it clears the
  no-new-rules bar in `content.md` rather than bending it.

  **Cost came in at 4.3x, and the reason is new.** 238ms against the other four's 56ms, which is the
  retry client's number and not the breaker's, but arrived at differently: a handler that resolves
  immediately settles in microtasks and moves the clock zero times, so only the deliveries that are
  generated slow cost anything. ADR-0182's predictor therefore holds a third time and gains a
  corollary, which is that scenarios can be made cheap by generating most of them not to need the
  clock at all.

  **Three blind spots are accepted rather than chased.** A dead-letter reason that ignores the error
  is caught by the fourth checkpoint and not by this one, which is the right division of labour and
  not a gap. A heartbeat late by a millisecond rather than by a whole interval exposes the job only
  at the instant of the deadline, and whether the probe sees it depends on which timer the clock
  fires first at a tie, so it is not something to build a rule on. And nothing here runs two
  consumers: the brief puts that under "if you finish early", so generating it would be a new
  exercise rather than a stricter reading of this one.

- **ADR-0184 — `class-places-sqlite`'s generated checkpoint is refused, because the workout has one
  interleaving point and it sits outside every transaction.** ADR-0167 qualified it on the contract,
  "places left equals capacity minus live bookings under any interleaving, and never goes negative",
  which is a real invariant and clears the first two of that audit's four tests. It fails the third,
  which is the one that matters: the generated version has to reach a case the hand-written examples
  structurally cannot, and here it cannot.

  **The reason is mechanical.** `runDuringNextCheck` is the only hook the workout has, it fires
  inside `checkMembership`, and `checkMembership` runs before `book` opens its transaction.
  better-sqlite3 is synchronous. So every `book` and every `cancel` is atomic with respect to every
  other one, and what looks like a generated interleaving is a serial ordering of atomic operations.
  The three orderings that carry the contract are the three the hand-written checkpoints already
  are.

  **Measured rather than argued.** Eleven planted bugs, and a throwaway generator running 240
  scenarios across two seeds, nesting to depth three over all three classes and both connections,
  auditing the invariant on every class after every operation and checking what each call reported
  against what the class then held. It caught exactly the four the hand-written checkpoints catch,
  and missed exactly the seven they miss. Not one bug separated them.

  **The seven neither catches split two ways, and the split is the argument.** Two are not bugs at
  all: a read-decide-write is correct here as long as the read is inside the transaction, and
  recomputing the count from the bookings is correct as long as the guard stays. The other five all
  need something to commit while a transaction is open, which is the one thing nothing can do: no
  transaction at all in `book`, none in `cancel`, a deferred transaction that reads before it
  writes, an exclusive lock held across the whole booking, and a `cancel` whose state guard exists
  only in its early check. Five bugs, one reason, and it is the same reason the generator adds
  nothing.

  **What would reopen it is a second hook, inside the transaction, and that is refused separately.**
  `db.ts` and `members.ts` are handed to the reader as the environment they are working in. ADR-0166
  declined to make `clock.ts` cheaper for a suite's benefit on the grounds that it changes what the
  reader is given, and widening a hook to make a checkpoint stronger is the same move.

  **Cost was never what stopped it**, which is worth recording on its own. The throwaway generator
  ran its 240 scenarios in 448ms against the other four's 74ms, so ADR-0182's prediction that the
  database ones stay cheap held. A cost prediction can be right and the checkpoint still not be
  worth having.

- **ADR-0186 — `product-search-drizzle`'s axis was the two searchable columns agreeing with each
  other, and it is the first generated checkpoint whose oracle covers only half of what it checks.**
  Every term the four hand-written checkpoints use finds names or SKUs but never a *different* row
  through each, every SKU match is a prefix, every SKU is bare uppercase, and both characters that
  mean something to LIKE sit in a name. So an implementation that treats the two columns differently
  in its escaping, its case folding, its anchoring or its counting is invisible. Several things held
  still at once, none of them a parameter of the problem, which is ADR-0183's shape again.

  **Twelve planted bugs, twelve caught, eight caught by nothing else**: escaping only the first
  metacharacter, searching a term that was trimmed for the blank test and not for the query, counting
  on one column while paging on two, upper-casing the term before matching the SKU, tie-breaking on a
  price the tied rows share, paging two queries separately and merging them, anchoring the SKU match
  to the front, and splitting the term into words and requiring all of them. Two *correct*
  alternatives pass, which is the check that matters in the other direction: tie-breaking on
  `(name, sku, id)` and on `(name, sku)` are both fine and the rules say so.

  **The oracle is half of one.** ADR-0167 named this the other workout with a real oracle after
  `json-parser`, and that is right but narrower than it sounds. Whether a row matches is a substring
  test JavaScript can answer, so the match set is computed. Paging, ordering and counting have no
  oracle and are read off a trace of the walk, exactly as everywhere else. The split is worth
  recording because "no second implementation" is otherwise the rule, and here it holds for three of
  the four things being checked.

  **Two fences make the oracle sound, and one of them turned into the axis.** Everything generated is
  ASCII, because Postgres and `toLowerCase()` disagree on `'İstanbul'`. And names are lowercase
  alphanumeric with no spaces, so comparing them in JavaScript agrees with `ORDER BY name` under any
  collation the database was built with. That second fence forced the metacharacters out of the name
  column and into the SKU, which is precisely the decorrelation the four never do: a constraint
  arrived at for soundness turned out to be the thing worth generating.

  **No forced prefix, which is the first time.** Measured: a term that finds one product by name and
  a different one by SKU costs one catalogue to reach on one seed and four on the other, because
  terms are cut out of the rows themselves and the two columns are built from different spellings of
  the same words. Where the other generated checkpoints put the bias in a block of scenarios at the
  front, this one has it in how a term is made, and a prefix was written, measured, and deleted.

  **Duplicate SKUs were available and refused.** A catalogue with two rows under one stock code fails
  an implementation that tie-broke on `sku`, and the schema declares no unique constraint, so it is
  legal data. It is also a data fault rather than something a search has to survive, and accusing a
  submission over one would be a gotcha. The tied block shares a name and a price instead, which is
  what one product in several sizes looks like, and the price tie-break is still caught.

  **Cost is 0.27x and the ratio is misleading**, which is worth recording once. 2281ms against the
  other four's 8446ms, but roughly 2.1 seconds of each of those five is PGlite booting, paid once per
  test file; the generated work is about 180ms of it. ADR-0182's predictor reads here as pages walked
  per scenario rather than clock movements, so the knob is the floor on the page size and not the
  scenario count.

  **Four blind spots are accepted.** A blank term filtering with `undefined` rather than with a `%%`
  pattern is behaviourally identical and no rule can see it. Which column matched is invisible
  wherever both would land on the same rows. Query count and index use belong to checkpoint 04 and to
  "if you finish early", so a second read of the SQL text would be duplication. And a write during a
  walk is refused rather than deferred: offset pagination cannot survive one, the brief never claims
  it can, and that lesson is `alert-feed-sqlite`'s, which is what keeps the two checkpoints disjoint.

- **ADR-0187 — `records-sorting-drizzle`'s axis was that its one walk happens in the one configuration
  where paging cannot go wrong, and it empties ADR-0167's qualified list.** The four hand-written
  checkpoints walk the pages exactly once, ascending, over a column whose twelve values are all
  different and never null, at a page size that divides twelve exactly, stopping on the last full
  page. Four things pinned at the same time, none of them a parameter of the problem, which is
  ADR-0183's shape a second time. Two of the four sortable columns are never sorted on at all, and
  one of those is the nullable one `db.ts` calls nullable on purpose.

  **Twelve planted bugs, ten caught, five caught by nothing else**: an allowlist keyed `started_at`
  so a request for `startedAt` falls back to name without saying so, a copy-paste that maps
  `startedAt` to the name column, a `WHERE` that drops the rows with no start date, sorting the whole
  table in JavaScript with a comparator that calls null equal to everything, and descending
  implemented as the ascending list read from the other end. That last one is the best of them: it is
  correct on every page size that divides the roster, which is every page size the other four use.

  **The tie-break cannot be observed, and the reference is the evidence.** ADR-0167 wrote this
  workout's contract as "concatenating the pages gives a total order containing every row once", and
  the total-order half is invisible: `employees.id` is the rowid, so a table scan visits in id order
  and SQLite's sorter is stable, which makes `ORDER BY col` and `ORDER BY col, id` the same query for
  any data this schema can hold. Measured over 61,248 comparisons. The reference ships
  `asc(employees.id)` and the brief files making it explicit under "if you finish early", both
  consistent with it being decoration. Every one of the five unique catches lives in the other half,
  "every row once", and comes from partial last pages, columns nobody sorts on, and nulls.

  **One reachable bug was refused.** Clamping a requested page to the last real page is a plausible
  first draft, and a walk that asked for a page past the end would catch it. The walk follows the
  total it was handed, because that is what a page control does with it, and the brief says nothing
  about a page that does not exist. Catching it would have meant adding a rule rather than reading
  the same one more strictly.

  **Two things the brief calls optional are deliberately unchecked**, and one of them was written
  before it was deleted. Rows with a null sort key are skipped by the ordering rule rather than
  expected at one end, because `nullsLast` is an "if you finish early" item and either placement is
  allowed. A rule about where they sit was written, measured to catch nothing the other rules already
  caught, and removed.

  **Cost is 104ms**, and the ratio is the misleading number here for the second time. It is 0.26x the
  other four, but 371ms of their 398ms is the client checkpoint booting jsdom; against the three
  server checkpoints it is nearly four times them. The absolute figure is the one worth quoting, and
  ADR-0182's predictor has now been right on every workout it was applied to.

  **This empties the list ADR-0167 qualified.** Six of its seven were built, one was refused on the
  contract (ADR-0184), and what is left is the three it deferred on cost rather than on contract:
  `outbox-relay-node`, `idempotent-payments-express`, `rate-limit-express`. Those are a different
  question, because in all three the harness rather than the property decides the runtime.

- **ADR-0188 — The structured-output workout is a second visit, and its fixture reads what the
  submission says back to it.** `structured-output-node` starts from `tool-loop-node`'s solution and
  adds the three things the roadmap named: a `stopReason` of `max_tokens` carrying a truncated body,
  an answer that parses and does not fit the schema, and a 429 carrying `retryAfterMs`. It is the
  second second-visit workout after `outbox-per-order-node` and the first in this track, and the
  pattern held: the loop is handed over working, and what is editable is only what the new
  requirements touch.

  **The fixture reading the submission's own words is new, and it is the only way one of the three
  lessons is checkable at all.** A reply cut off at the completion limit is not a mistake, so a model
  told "that field is missing" sends the same fragment again, and a model told "you were cut off"
  sends a short one. Nothing structural separates those two complaints; only what they say does. So
  `RecordedTurn` grew a `told` hook and the transcript branches on it. The cost is that a checkpoint
  now depends on the reader's phrasing, and it is paid twice over: the brief states the requirement
  in as many words rather than leaving it to be guessed, and the hook accepts ten ordinary ways of
  saying it rather than one form. **A brief may state a requirement precisely; what it may not do is
  state the diagnosis**, and "tell it the answer was cut off" is the first, not the second.

  **The sharper version of that lesson was looked for and is not reachable.** A truncated body that
  still parsed as JSON would make a naive implementation produce a confident, specific and wrong
  complaint ("reason is missing"), which is a better lesson than "malformed". It cannot happen: an
  object cut off mid-value has no closing brace, so a truncation is essentially never valid JSON. The
  checkpoint teaches the reachable version, and the transcript's fragment is the front of a real
  sentence rather than something contrived to parse.

  **The clock records waits instead of taking them**, which is the opposite of `queue-consumer-node`
  and `one-recompute-not-fifty`, where a checkpoint drives the clock forward and pays a macrotask
  each time. Nothing here needs to observe anything while a wait is in progress: what is being
  checked is the number the code decided to wait and what it did afterwards, and both are readable
  once it is over. The whole workout runs in 19ms of test time because of it, and the rule that falls
  out is that a driven clock is for observing an interleaving, not for representing a delay.

  **Where the retry sits is the whole of the third lesson.** A `RateLimitedError` read nothing and
  charged nothing, so the conversation already built is still the one to send, and waiting inside the
  turn loop is what keeps the tools that already ran from running again. Catching it around `decide`
  instead is the plausible first draft and is what the brief's third symptom describes: one order
  looked up eleven times on a busy morning. `store.ran` was already the probe that makes it
  observable, inherited from part one without changing it.

- **ADR-0189 — The eval harness earns its place on the two things that are not a test suite, and it
  had to be checked before it was written.** The roadmap queued it with a bar attached: a workout
  whose lesson is "compare output to expected" is a test suite with a different name on it, and the
  AI-engineering track does not need one of those. Two things survive that test and the workout is
  built on them. **A case is a rate rather than a verdict**, because the same input has more than one
  answer and one answer was never a measurement. And **a rate means nothing except against the last
  one**, so the gate is a fall past a tolerance and not a number on its own. Neither is a thing a test
  suite does, and everything else the workout touches follows from them.

  **Three states are neither a regression nor a pass, and each got its own list.** A case with no
  baseline entry, a baseline entry the set no longer has, and a case nobody ran. Folding any of them
  into the rate is the bug the workout exists to teach: a case that vanished quietly takes its score
  out of the total, and a case with no answers is not a case that got everything wrong. That last one
  is also the arithmetic trap, since zero over zero is `NaN` and `NaN` propagates into the total
  without failing anything.

  **The overall figure is the mean of the case rates rather than of the answers**, and it is a real
  choice rather than an obvious one. Averaging the answers would let a case somebody ran six times
  outweigh the one beside it that ran four, which measures how much anybody sampled rather than how
  well anything did. The brief states it rather than leaving it to be inferred, because both are
  defensible and only one is checkable.

  **One recorded answer calls a furious customer pleased, and it passes.** The JSON grader checks the
  shape and never the values, so a confident wrong classification is invisible to it. That is kept
  rather than fixed: it is the sharpest thing in the workout about what a grader is worth, it is
  named in the file that defines the graders, and it is one of the three questions the brief leaves
  at the end. ADR-0048's rule about fakes keeping awkward semantics applies to graders too.

  **The recordings are what make it a fixture rather than a mock.** The same input has several
  answers, the number of them differs between cases because the ones nobody trusted were run more,
  and one case has none at all. A recording that gave one answer per case would have taught the test
  suite this workout exists not to be.

- **ADR-0190 — `rate-limit-express` was deferred on a harness cost of 0.4ms a request, and it is
  built.** ADR-0167 held it and two others back because the invariant is driven over HTTP, "where the
  harness rather than the property decides the runtime". Measured, a supertest request against a
  listening server is 0.23 to 0.70ms in steady state, and the same middleware driven as a plain
  function with mock request and response objects is 0.001ms. So the audit was right about the
  proportion, and wrong about what it implied: HTTP is 99.7% of the cost and the cost is still small.
  The checkpoint runs 28 bursts on each of two seeds in **550ms** against the other four's 187ms,
  which is under `circuit-breaker-node`'s 600ms in absolute terms.

  **The axis is the two numbers the workout is configured with.** Every one of the four hand-written
  checkpoints runs at five requests per sixty seconds, so a limiter that ignores its own options and
  writes both into the code passes all of them. Two of the four bugs only this checkpoint catches are
  exactly that, and they are the cheapest kind of hole to leave: nothing about them is subtle, and no
  suite that never varies a parameter can see them at all.

  **The other two are `Retry-After`, and reaching them needed the checkpoint to obey it.** The four
  assert it is a whole number inside the window and never come back when it says to, so a header that
  always says the whole window and one that always says one second both pass. Checking it means
  replaying the burst up to the refusal with a wait on the end, twice: once at the moment the client
  was told, which has to be let in, and once a second earlier, which has to be refused. A probe
  request cannot do it, because a probe spends the allowance it is asking about. That is the thing an
  example-based test cannot do without becoming a generator, and it is the strongest argument in this
  whole queue for why the fifth checkpoint is a different kind of test rather than more of the same.

  **A window model is not the reimplementation ADR-0166 refused.** The rules track when each client's
  window opened and how much it has spent, which looks like a second limiter and is not: what is
  modelled is the contract, from the brief's own definition and the ops the burst emitted, and
  nothing in it knows what a Redis key or a TTL is. This is the move ADR-0182 already sanctioned when
  the retry client's expected waits were computed from the formula on its page rather than by running
  a second client. The test that keeps it honest is the failure message, and these name rules.

  **Eleven planted bugs, eleven caught, four caught by nothing else.** Two blind spots stay: the
  solution's `Math.max(1, resetIn)` and its `ttl >= 0 ? ttl : windowSeconds` fallback are both
  unreachable against this `FakeRedis`, because `expire` always runs on the first request, so a
  variant that returns the raw TTL is indistinguishable from the reference. That is dead code in
  shipped content rather than a gap in the checkpoint, and it is recorded rather than removed: the
  fallback is right against a real Redis, where a key can lose its deadline.

- **ADR-0191 — `outbox-relay-node` was deferred on a premise that was never true of it, and it is
  built.** ADR-0167 held it back with the other two as "a real invariant driven over HTTP, where the
  harness rather than the property decides the runtime". There is no HTTP in this workout at all:
  `db.ts` is in-memory better-sqlite3 and `broker.ts` is a fake in the same process. The audit read
  three workouts as one and one of the three was not what the sentence said. Worth recording as a
  process finding rather than a technical one: a deferral that groups things is a deferral nobody
  re-reads per item.

  **The axis was sitting in the tree with a name on it.** `db.failNextWrite(fragment, skip)` is
  documented in `db.ts` as "how a checkpoint breaks the middle of a batch rather than the start of
  one", and no checkpoint in this workout passes the second argument: the write that records a
  publish is killed exactly once, on a backlog of one row. The sibling `approval-log-sqlite` does
  pass it. So the affordance for the gap was built, shipped, and never used, which is the clearest
  signal any of these seven had.

  **Fourteen planted variants, twelve of them real, twelve caught, two caught by nothing else**, and
  both of the two live in that seam: a recording write that dies mid-batch and is swallowed so the
  pass carries on, and one that is swallowed and counted as a publish. Two is the same count
  `circuit-breaker-node` shipped on, and it is low for a reason worth stating: this workout's four
  are unusually strong, and eight of the twelve are caught by more than one of them.

  **Two variants that look like bugs are not, and are recorded so nobody plants them again.**
  Counting a row before marking it rather than after, and guarding the mark with
  `AND published_at IS NULL`, are both indistinguishable from the reference here: the mark either
  lands or throws out of the pass, so there is no state in which the count and the mark disagree.

  **Cost is 495ms against the other four's 62ms.** Eight times by ratio and under
  `circuit-breaker-node` in absolute terms, which is the third time the ratio has been the misleading
  half (ADR-0186, ADR-0187). What costs here is `broker.publish`, whose `setTimeout(0)` is 1.5ms, so
  ADR-0182's predictor holds with a different noun: publishes per scenario rather than clock
  movements.

- **ADR-0192 — `idempotent-payments-express` gets a fifth case rather than a fifth checkpoint, and
  its headline lesson turns out to be uncheckable by anything.** Cost was not what refused it: a
  charging POST measures at 1.7ms and a replay at 0.3ms, 40 scenarios on two seeds come to 170ms,
  and the 1.7ms is the gateway's own `setTimeout(0)` rather than the transport. So ADR-0167's HTTP
  sentence was wrong about this one too, just less dramatically than about `outbox-relay-node`.

  **The contract half is what refuses it.** Ten variants, four missed by the four hand-written
  checkpoints, and only one of the four is both a real bug and reachable by generation. Of the other
  three: checking a 409 before a 422 needs a rule about which wins for an in-flight key carrying a
  changed body, and `brief.md` states both rules and never settles their overlap, so asserting it
  invents a requirement. Caching the loser's 409 as the key's answer needs a gateway that can fail,
  and `FakeGateway` has no failure mode, so reaching it means editing a file that is not `editable` —
  the move ADR-0166 refused over `clock.ts`. And the third is below.

  **The one real catch is one case, so it is written as one case.** A single in-memory "one charge at
  a time" guard makes a payment on one key wait for a payment on another, and unforced generation
  needs 200 scenarios to find it reliably on one of two seeds. Hand-written it is fifteen lines in
  `03-two-submissions-at-the-same-moment`, and it is now there: hold the gateway, start `pay_1`, wait
  for its charge, start `pay_2`, and require the second charge to reach the gateway without the first
  being released. Confirmed red against that variant and green against the reference, and it is the
  only test in the workout that fails it. This is ADR-0184's shape with a different ending: the
  contract is real, the runtime is fine, generation does not reach a case the examples cannot, and
  what was missing was an example.

  **Separately, and worse: the workout's headline lesson cannot be failed by any suite here.** A
  submission that does `SELECT` then `INSERT` instead of claiming with `INSERT OR IGNORE` is the bug
  the whole exercise is about, and in one Node process there is no `await` between those two
  statements, so nothing can interleave there. `gateway.hold()` fires inside `charge()`, by which
  time the row is already written. No hand-written checkpoint fails it and no generated one could.
  That is a hole in the workout rather than in this decision, and closing it needs a second process
  or a database that can be made to yield mid-statement, neither of which this workout has. Recorded
  rather than left to be rediscovered.

- **ADR-0193 — What ten generated checkpoints taught, now that the queue ADR-0167 opened is empty.**
  Seven were qualified and three more deferred on cost. Eight were built and two refused, every
  refusal after a generator had been written and measured rather than argued. These are the findings
  that belong to the exercise rather than to any one workout, and they are here because the roadmap
  row that held them is gone: a section with nothing unbuilt in it is not a queue.

  **The axis was never once a parameter of the problem, and predicting it was worse than not.** The
  roadmap named it wrong twice and named none once, and the time it named none was the only time it
  was right, which is why ADR-0182 stopped it naming one at all. What it always turns out to be is
  whatever the hand-written examples happened to hold still: one thing in ADR-0182, two at once in
  ADR-0183 and ADR-0186, four at once in ADR-0187. In ADR-0191 it was an unused argument on a test
  helper, documented in the workout's own file as the thing it was for, that no checkpoint ever
  passed.

  **A constraint taken for soundness can turn out to be the thing worth generating.** ADR-0186's
  names had to be lowercase and unpunctuated so that comparing them in JavaScript agreed with the
  database's collation, which forced the LIKE metacharacters out of the name column and into the SKU.
  That was the decorrelation the four hand-written checkpoints never did. Worth knowing because it
  runs against the instinct to treat a fence as a cost.

  **The cost predictor held every time, and the ratio misled half the time.** It is how many times
  the expensive thing has to happen, and only sometimes is that a clock: publishes per scenario in
  ADR-0191, pages walked per scenario in ADR-0186. Where one checkpoint in a workout boots something
  expensive, PGlite or jsdom, the multiple is meaningless and the absolute figure is the one to
  quote.

  **A deferral that groups things is a deferral nobody re-reads per item.** Three workouts were held
  back on one sentence about being driven over HTTP. `outbox-relay-node` has no HTTP in it at all,
  `idempotent-payments-express`'s cost was its gateway's own timer rather than the transport, and
  `rate-limit-express` genuinely was 99.7% harness and the harness was 0.4ms a request. The sentence
  was defensible about none of the three once each was measured, and grouping them is what stopped
  each being measured.

  **The two refusals are not the same refusal, and both were worth the generator.**
  `class-places-sqlite` has nowhere to stand: its only hook fires before any transaction opens, so
  every operation is atomic against every other one and a generated interleaving is a serial order
  (ADR-0184). `idempotent-payments-express` had exactly one reachable catch, and one catch is an
  example rather than a generator, so it was written as an example (ADR-0192). In both cases the
  generator was built and run before the refusal, and in both cases that is what turned an opinion
  into a number.

  **The sharpest thing the exercise found is not about generated checkpoints at all.**
  `idempotent-payments-express` teaches that a claim must be an `INSERT OR IGNORE` rather than a
  `SELECT` then an `INSERT`, and in one Node process nothing can interleave between those two
  statements. No suite this workout could have will fail a submission that gets its headline lesson
  wrong. Looking for what a generated checkpoint could not reach is how that surfaced, which is an
  argument for the audit independent of anything it shipped.

## The handbook

- **ADR-0067 — Pages are markdown that reads fine on GitHub.** The repo is public and that reach costs nothing.
  The app adds what GitHub cannot: section navigation, and practise links resolved to live problems
  and workouts.

- **ADR-0068 — The systems section teaches concepts before case studies.** You fail a system design
  conversation on fundamentals, not on not having read enough architectures. The case-study shelf
  hangs off the section as further reading rather than as pages.

- **ADR-0069 — Interactive diagrams are deferred.** A diagram you can drag a node around in is application code
  per diagram, which breaks the rule the whole library rests on. Revisit only if a specific concept
  proves it cannot be taught any other way, and then build that one thing rather than a framework
  for it.

- **ADR-0070 — Fenced ASCII is the floor for diagrams and Mermaid is the step up, and the dependency is the
  decision.** Mermaid keeps a diagram as diffable text and renders on GitHub, at the cost of a
  not-small dependency in the app bundle rather than in a workout workspace. Committed SVG needs no
  dependency and gives up diffability and easy authoring; ASCII needs nothing at all and caps what
  can be drawn.

- **ADR-0071 — Pages say which engine they mean.** The source material teaches Postgres and Hone runs SQLite
  and PGlite, so a page names its engine and notes where SQLite differs. This is not pedantry:
  writing the SQL section against `practice.db` rather than from memory contradicted three claims
  that would otherwise have shipped as fact, including that SQLite accepts a select-list alias in
  `WHERE` where Postgres refuses, and silently resolves it to the table column when the alias
  shadows one.

- **ADR-0072 — Databases and writing SQL are two sections on purpose.** Databases is where a query goes wrong:
  indexes, plans, N+1 and pagination, all of which assume you can already write the query being made
  slow. Writing SQL is where the query gets written.

- **ADR-0073 — Reading order is the reader's order, not the build order.** The section manifest owns what a
  reader sees, which is why writing SQL sits before databases (writing a query comes before making
  it fast) and security sits directly after headers.

- **ADR-0074 — Some pages keep no easy problem behind them, and that is a refusal rather than debt.** An easy
  rep is a real thing met in ordinary feature work, answered in under two minutes by someone who has
  just read the page. Back-of-envelope estimation is performed out loud, consistent hashing is
  consumed rather than configured, and a rep written to fill the row would teach that the
  definition was the point.

- **ADR-0075 — The easy-rep bar is deliberately not enforced mechanically.** "Has an easy problem" is checkable
  and would be the wrong thing to check, because passing it by writing trivia is easier than passing
  it honestly.

- **ADR-0076 — No page-level progress tracking, no streaks, no completion states.** Problems and workouts
  measure progress; pages are reference.

- **ADR-0077 — No search until the page count demands it.** The section list and the practise links are how you
  arrive at a page, and search would be machinery ahead of the need.

- **ADR-0078 — Not a wiki, not exhaustive, and never a mirror of someone else's course.** Exhaustiveness is the
  failure mode that turns reference into something nobody opens.

- **ADR-0079 — Testing is deferred, and its threshold is written down so it stays a decision rather than an
  oversight.** Its problems are a small cluster, all about testing-library and React, which is the
  thinnest case in the library. It earns a section when the category grows past the JavaScript
  section's size, or when a workout's checkpoints are about the tests themselves, whichever lands
  first.

- **ADR-0080 — Deliberately absent: mobile and desktop, machine learning proper, a Python workout runtime.**
  Web is the stated priority, so React Native and Flutter wait until the web map is substantially
  built. Shipping against a model is web work and has a section; training one is not. FastAPI earns
  one comparison page, because seeing a third framework name the same seams is what makes them
  visible as seams, but a FastAPI workout would put a Python runtime in the workout runner, which is
  a far larger decision than a dependency line.

- **ADR-0081 — TypeScript and data structures both left "deliberately absent", and the rule those reversals
  produced matters more than either.** TypeScript was excluded because the source material was thin,
  and DSA
  because patterns are better practised than read. Both came back when practice volume said so: the
  problem set now reaches conditional types, `infer` and assertion functions, and choosing between
  an array, an object, a `Map` and a `Set` is a decision made in ordinary feature work that nothing
  explained. **The general rule: the original arguments were about source material and the pairing
  rule is about the reader, and the reader wins.** Anything else in "deliberately absent" stays
  absent until its practice volume says otherwise. Note that the reversal on DSA is narrow: the
  patterns themselves stay in `dsa-patterns` as graded implementations, because a page about sliding
  window teaches less than three of those.

- **ADR-0082 — "Nothing to practise" is a reason to write reps, not a reason to defer a page.** The B-tree page
  was deferred on exactly that ground and the deferral was reversed the same day, which is the more
  useful half of the story. The gap was real and measured: the term appeared six times across
  `databases`, `sql` and `ai-engineering` and was defined nowhere, while
  `databases/how-an-index-gets-used.md` taught a sorted-array model that carries selectivity,
  leftmost prefix and `ORDER BY` elimination without ever saying how the start of a range gets found
  without scanning to it. The blocker was the one mapping this project enforces, that a page names
  somewhere to practise it. But the reps were missing rather than impossible, and writing ten of them
  cost less than waiting for `sql-performance`. The same reversal shipped `databases/search-past-like.md`,
  which answers a question `how-an-index-gets-used.md` had been raising and handing to nobody.
  **The rule to carry forward: defer a page when the material cannot be verified or when the reader
  would not notice its absence, not when the practice behind it merely has not been written yet.**

- **ADR-0083 — Index reps cannot be `sql` reps, and that constraint is load-bearing.** The SQL practice database
  carries no indexes on purpose, so a live query can never demonstrate one being used. Everything
  about index behaviour and full-text search is therefore authored as `short-text` and `explain`
  against output captured from a real engine, which is the same shape `sql-performance` took when it
  shipped, though against SQLite and `practice.db` rather than this engine. The engine here is
  PGlite, which is real PostgreSQL, so the captured plans are measured rather than
  recalled. Two claims died in that process: a rep asserted that a composite index falls back to a
  sequential scan when the leading column has high cardinality, and it does not, it reads the whole
  index and reports `Index Searches: 1`; and a page and its rep disagreed about how many lexemes
  `to_tsvector` returns for one sentence. Both were caught by re-running rather than by review.

- **ADR-0084 — AI engineering is in scope, and the scope moved once, deliberately.** What a web engineer is
  asked to build now includes an endpoint that streams tokens and a tool server another program
  drives. That is web engineering with an unfamiliar dependency on the end of it, and it fails in
  web-engineering ways: timeouts, backpressure, idempotency, cost per request. Training and model
  architectures stay out.

- **ADR-0085 — Security covers what a web engineer builds and reviews, not offensive security.** No
  exploitation technique gets a page it does not need for the defence to make sense.

- **ADR-0086 — An API is a module, not a page.** The query-params and dates categories were both carried as
  handbook debt until it became clear the handbook was never their home. Repeated keys, `set`
  against `append` and the plus-sign space trap are the edges of one API met one at a time, not a
  mental model to explain. A model is a page; an API is a module.

- **ADR-0150 — Structured output and the tool-call loop are two pages, and the tool reps stay where they are.**
  The roadmap left the split open to be decided while writing, and the traps section decided it.
  Turning a reply into data fails at the parse, at a schema the provider will not compile, and at a
  stop condition that ended the response early. A tool call fails at a promise the model made before
  anything ran, at a loop with no ceiling, and at an instruction that arrived inside a tool result.
  Neither list is a subset of the other, and one page carrying both would have run half again longer
  than anything else in the section. What did not follow is the move the same roadmap entry
  suggested: `ai-tool-schema-is-the-contract` and `ai-tool-authorization-boundary` are cited by the
  new page **and** stay on `mcp-servers.md`, because pairing was never 1:1 and moving them would have
  thinned the MCP page without making the tool page truer. The MCP page keeps the protocol; the tool
  page owns the mechanism underneath it.

- **ADR-0151 — Five `systems` pages get no easy rep, and the on-ramp audit closes on that.** Service
  discovery, sharding, consistent hashing, CAP and back-of-envelope cite only medium and hard reps,
  and after the rest of the audit shipped they are the whole of what is left: every other page in the
  library now names a way in. They stay as they are. The easy rep for each would be "what is this
  called", which `content.md` rules out in as many words, since writing it teaches that the
  definition was the point; where a definition is worth knowing cold the route is a deck card, which
  is entered on purpose rather than dealt to a morning. The audit itself also lost half its subject
  along the way: a practise list is sorted easiest-first by the app, so a page whose author named a
  hard rep first no longer leads with it, and only "cites no easy rep at all" was ever findable.
  **The rule to carry forward: a page with no easy rep is a finding rather than a defect, and closing
  it sometimes means writing down that it stays open.**

- **ADR-0152 — Document-store modelling is one page in `databases/`, and its reps are `sql` reps.** The
  queue allowed one or two pages and one was enough: access-pattern-first modelling, denormalisation
  and its write amplification, and what "schemaless" moves into your code are three claims about the
  same decision rather than three subjects. Two things were rejected on the way. A category of its
  own, because the decision is which shape a thing is stored in, which a relational engine asks you
  every bit as much as Mongo does; the two new reps are a copied column that drifted and an embedded
  list with no ceiling, and neither names a product. And a Mongo-shaped page, because the page a
  reader needs is the one that ends with them choosing, not the one that teaches an API this repo
  ships no practice for. `jsonb` is named in the worked example for the same reason: it is where most
  readers will actually meet the trade. **Mongo and Mongoose stay deferred** and this page does not
  move that bar, which is unchanged since ADR-0054 — a brief has to need a document store.

- **ADR-0155 — Recurrence is a page in `apis/`, and it does not reopen ADR-0086.** That entry put the
  `dates` category in a module and called the handbook the wrong home for it, which reads at first
  like a bar against this page. It is not, and the reason is ADR-0086's own test: `Date` is an API met
  one edge at a time, and a recurrence rule is a model, so the rule sends the first to `js-date` and
  the second here. Four reps share that model and getting it wrong is what makes all four fail, which
  is the page bar in `content.md` rather than an exception to it. Three homes were rejected. A `dates`
  handbook section, because one page is not a section and the roadmap's section queue is enumerated
  and meant to run out; if recurrence turns out to want neighbours, that is the moment to revisit, not
  now. `databases/`, which owns what a shape charges you, where the row is the least interesting part
  of this and the traps are calendar semantics. And `javascript/`, which owns the language rather than
  a calendar format nothing in the language implements. `apis/` earns it on the endpoint shape:
  an infinite series has no last page, so the caller names a window, and `pagination.md` now argues
  the same point from the finite end.

- **ADR-0156 — The backfill page is Postgres-only and its numbers are measured, not sourced.** Every
  figure on `databases/backfilling-a-large-table.md` came out of a real PostgreSQL 17.10 on a
  500,000-row table: the 25 MB heap that became 57 MB after one full `UPDATE`, the `VACUUM` that
  cleared 500,000 dead tuples and shrank the file by nothing, the same `VACUUM` reclaiming zero with
  one idle `REPEATABLE READ` reader open, and the offset-paged loop that silently left 250,000 rows
  unbackfilled. That last one is the reason the page exists and it could not have been written from
  the documentation, because no document says how many rows you lose. **The precedent to note is that
  a page may depend on a daemon this repo does not ship**, which a workout may not without declaring
  it in `requires`; the asymmetry is right, because a reader without Postgres loses nothing but the
  ability to re-run a number the page already states. It was rejected as a traps-section addition to
  `orms/migrations.md`, which owns DDL and its locks: a data backfill takes `ROW EXCLUSIVE` and blocks
  no readers at all, so folding it in would have blurred the one distinction most worth having. Its
  two reps sit in `sql-performance.ts` despite that file being SQLite throughout, because
  `sqlperf-keyset-page` is the same defect read from the write side and separating them would hide
  that; the file's header now says so.

- **ADR-0157 — The dual write is one page in `systems/`, and it answers a paragraph left open in
  `moving-data/`.** `queues-and-background-jobs.md` names the producer-side gap honestly and stops at
  "pick per message type, according to which of the two you would rather explain", which was right for
  an email and wrong as a general answer: where the far side is a system you own, the outbox removes
  the gap rather than choosing a side of it. That page now points here and keeps its own framing,
  because an email really cannot be unsent. `moving-data/` was rejected as the home even though the
  setup lives there, since the section is about picking a transport and this is not one; `systems/`
  already owns "another copy of the data". Only one rep was written. The obvious second, that an
  outbox is still at-least-once and the consumer still has to be idempotent, is `sys-idempotency`
  verbatim, and the page cites it instead — an uncited rep is not debt and a re-cited one is not
  either.

- **ADR-0158 — Logs, event sourcing and durability are three pages in `systems/`, and none of them is
  a module.** The request arrived as a list of six words, durability, event sourcing, SQS, queues,
  event streaming and message bus, with a module suggested. **A module was impossible rather than
  unwanted**, and the reason is worth keeping because the same request will come again: a module is
  built from `js run` and `js assert` fences that execute offline in a bare realm, so it can only
  teach something that runs on the reader's machine, and there is no broker there. ADR-0086 settles it
  from the other side anyway, since all six are models. Two of the six got no page. **SQS**, because it
  is already the worked example inside two pages and a product page is what ADR-0068 refuses. **Message
  bus**, because it is not a concept: it names the fan-out question, which both a queue and a log
  answer, and it is one paragraph inside `the-log-is-not-a-queue.md`. **Auditing folded into event
  sourcing** rather than splitting, since an immutable event log is the audit trail and two pages would
  have restated each other. Worked examples were measured against a real PostgreSQL 17.10 on the same
  ground as ADR-0156, using a replication slot as a log with a cursor because `wal_level` was `replica`
  and restarting somebody's server to get logical decoding is not a thing content authoring gets to do.
  **One measurement changed a page**: snapshots were going to be written up as the answer to a slow
  projection, and rebuilding 200,000 events measured *slower* through snapshots (23.4 ms) than without
  them (15.3 ms), while one aggregate with a 100,000-event stream measured 18x faster. So the page says
  the trigger is stream length rather than log size, which is the opposite of what it would have said
  from the documentation.

- **ADR-0159 — Upgrading the model is one page and it lives in `ai-engineering/`, not
  `dependencies/`.** The roadmap framed it as joining two sections, and only one of them could host
  it. The `dependencies` section is a worked example of this repo's own pnpm tree, with ranges, a
  lockfile and command output from a named pnpm version; a page with no lockfile, no range and no
  tree would have been the one page there with none of the section's furniture. It argues with
  `dependencies/updating-a-dependency.md` by cross-link instead, which is what the roadmap actually
  wanted. **One premise in that framing was wrong and the page says so**: the alias that silently
  moves under you is real but historical, since ids from the 4.6 generation are dateless *and*
  pinned, and the vendor documents the evergreen-pointer reading as a common misconception. The
  sharper version, which the page teaches, is that weights are pinned per id and the serving
  infrastructure around them is not. **It was not split in two.** The "how you gate the change" half
  is `evals-as-tests.md` read from the other end rather than new material, and splitting would have
  produced a page that mostly cites another page.

- **ADR-0160 — Isolation is four pages, and microVMs are not the fifth.** The roadmap sketched five.
  MicroVMs merged into the virtual-machine page because they *are* the answer to what that boundary
  costs, and a separate page would have restated the same kernel boundary with faster numbers. The
  section owns isolation as a security property and `production/` owns the image as packaging, which
  is the line that let both ship the same day without either restating the other. **The `node:vm`
  escape on the first page is measured on this repo's own sandbox shape, not recalled**: `typeof
  process` is `undefined` while `structuredClone.constructor('return process')()` reaches the host
  process and shells out as the user, and a `runInContext` with a 50 ms timeout returned in 1 ms
  while a callback the sandbox had scheduled ran 301 ms later. That makes ADR-0145 and the standing
  `node:vm` warning demonstrable rather than asserted, which is the reason the section was worth
  writing here rather than reading elsewhere.

- **ADR-0161 — Running it in production is four pages, and the image page is refused.** Isolation
  took the model half, which is namespaces and cgroups over one shared kernel. What was left on the
  production side was layer-cache ordering, `.dockerignore` and platform mismatch, which are facts
  you look up once and fix in a Dockerfile, plus artefact identity, where tag-versus-digest is
  already both the model and the practice on `what-a-deploy-is.md`. It would have been a Dockerfile
  tour with one borrowed idea. **The version worth writing if this is ever reopened is named so the
  refusal can be tested rather than re-argued**: "an image is a filesystem and a default command",
  whose traps are a laptop `node_modules` with the wrong native ABI, `COPY .` before the install so
  the cache never hits, and build args baked into an artefact that then cannot serve two
  environments. Two boundaries were held rather than crossed: deploy ordering stayed in
  `orms/migrations.md` and percentiles stayed in `systems/latency-and-throughput.md`.

- **ADR-0162 — Unix is four pages, and two sketched pages were dissolved rather than written.**
  **Exit codes**: both halves that matter found homes, since `128 + signal` and `process.exitCode`
  against `process.exit()` belong on the signals page where you meet them, and stdout truncation on
  exit is a trap on the stdout page. The remainder is `set -o pipefail` and `&&` chains, which is a
  shell fact you look up once rather than a model several reps share. **PATH, environment and
  quoting in CI**: three subjects wearing one title, and the only part with a model behind it, that
  your parent is not your shell and so never read your profile, is a trap on the process page. The
  rest is shell mechanics, which the section excludes by its own definition, or already covered in
  `dependencies`. Every number on these pages was measured on this machine rather than recalled,
  including the three shutdown timings, `EMFILE` under `ulimit -n 64`, `chmod 077` denying its own
  owner, and a forking shell swallowing `SIGTERM`. Container-side claims are citation-backed only and
  say so, because no daemon runs here.

- **ADR-0163 — Trade-offs and architecture is three pages, and prudent-against-reckless technical
  debt is refused.** The roadmap predicted the section would resist the page shape because trade-off
  thinking is learned in retrospectives, and it was right about exactly one of the four. What the
  debt topic contains is Fowler's four-way taxonomy over deliberate/inadvertent and prudent/reckless
  plus refactoring.guru's interest metaphor and its ten causes, and both are lists you read once.
  Applying the page test directly: name the several reps that share this model and fail together when
  it is wrong. There are none, and any rep written for it would be "which quadrant is this", which
  `content.md` rules out in as many words, since writing it teaches that the definition was the
  point. **The operative half of the subject is not lost, because it is a mechanism rather than a
  taxonomy**: debt is repaid by a migration, so `architecture/migrating-without-stopping.md` carries
  the interest metaphor and Larson's claim that migrations are the only mechanism to manage technical
  debt as a company and its code grow. The roadmap's further-reading shelf was also not built, since
  it is the systems case-study shelf under a new name and ADR-0068 already refuses it.

- **ADR-0164 — Three decks came out of reading the new sections, and a fourth deck over
  `production/logs-metrics-and-traces.md` was refused.** The refusal is about the deck only: that page
  ships, carries the cardinality rule, and has four reps behind it. The roadmap's rule is that a deck
  does not justify a page while a new page is
  worth re-reading for the contrast set it just made checkable, and the second half had never been
  exercised deliberately. Fifteen pages arriving at once was the occasion to try it. Three cleared the
  bar because getting them backwards is a bug you have shipped: the signal family, where a handler
  that only logs removes the exit; liveness against readiness, where the kill switch pointed at a
  shared dependency restarts a fleet; and namespaces against cgroups against seccomp, where a memory
  limit gets mistaken for a boundary. **The fourth was refused for being a taxonomy**, which is
  ADR-0163 one day later and the same test applied to a smaller unit. "Three signals, three
  questions" is a definition, and `content.md` says in as many words that a card drills a distinction
  rather than a definition. The genuinely checkable part of that page is narrower than a deck: where
  a high-cardinality field is allowed to go, which is one card and has no set to sit in. Note what
  this does not license. The two decks the roadmap has been holding, the redirect codes and the time
  formats, are still blocked on a `page` that does not exist, and reading fifteen pages that had
  nothing to do with either did not change that.

- **ADR-0170 — CQRS is its own page, and measuring it turned the page into an argument against
  adopting it.** It already had three sentences, inside the bullet list on `event-sourcing.md` that
  separates it from event streaming. That list answers "which of these three words do I mean", which
  is not the question anyone arrives with: theirs is whether the list page wanting a different shape
  from the write path means a second database, and the bullet says nothing about what saying yes
  costs. **The worked example was measured against a real PostgreSQL 17.10**, on the same ground as
  ADR-0156, and the numbers moved the page's centre of gravity. The list endpoint that groups over
  50,000 pending orders takes 84 ms; the identical answer, rewritten to page first and aggregate only
  those 50 rows, takes 0.30 ms; the read-model table takes 0.028 ms. **The query rewrite closed 99.6%
  of the gap**, so a slow list endpoint is not evidence for the pattern, and the page says so where a
  reader will hit it. What does survive is the second measurement: sorting the same orders by a total
  no row holds is 92 ms against the write model against 0.075 ms against an indexed read model,
  because you cannot index a value you do not store. Written from the documentation instead of the
  database, this page would have shipped the usual claim that a read model is what makes a list
  endpoint fast, which is only true of a query nobody rewrote.

  **No rep and no deck came with it**, and neither is owed. This paragraph also declined a workout,
  and that half is superseded by ADR-0171. The three failure modes the page teaches, a user not
  seeing their own write, a projection drifting, and a refresh locking readers out, are staleness
  and dual-write failures, which is what `sys-replica-lag`,
  `sys-strong-vs-eventual-consistency`, `sys-dual-write-two-orderings` and `outbox-relay-node` already
  practise; the page cites six existing reps and adds nothing to the seed. A rep that asked what the
  letters stand for would be trivia, and the deck test in ADR-0163 refuses a contrast set that is a
  taxonomy, which "command side against query side" is until it is attached to a system. It sits last
  in `systems/` rather than next to event sourcing because every page it leans on, replication,
  caching, the dual write and event sourcing itself, comes before it.

- **ADR-0172 — Where rendering happens is one page in `react`, and practising it is refused.** The
  roadmap row guessed that the topic cut across `react` and `moving-data`, and that a workout would
  need a bundler and two runtimes in the workspace. Half of that survived contact. The page sits in
  `react` because every failure mode turned out to be a React-runtime failure diagnosed inside a
  component and fixed with a React API, where `moving-data` is about choosing and living with a
  transport between machines; what actually cuts across sections is the reps the page wants, not the
  page. **The workout is refused, and the express fallback the row offered does not rescue it.** Three
  of the four traps are about DOM adoption, what hydration keeps, what it discards and what it leaves
  silently wrong, which no express workout can express, and the fourth only means anything against
  them.

  **Three claims on the page changed because they were measured**, on React 19.2.8 with the two passes
  in separate processes so the server one genuinely had no DOM. An attribute-only mismatch is silent
  in a production build, and the DOM keeps the server's value while React's tree believes the
  client's, which is the sharpest thing on the page and is in no document. A text mismatch discards
  every node up to the nearest `<Suspense>` boundary, the root where there is none. And
  `suppressHydrationWarning` silences the report without localising anything: the server's text stays
  on screen through later re-renders of that component. `react.dev/errors/418` 404s on fetch, so the
  production error string is reported as measured rather than cited, which is the citation policy
  working rather than failing.

  **The page ships with four practise slugs and only one is a `react` rep**, which confirms the
  roadmap's own observation from the other end: 38 `react` reps and not one about the pass that
  produced the HTML. That gap is reps rather than a page, and it is now a row rather than a footnote.

- **ADR-0173 — The uncited-rep count is retired as a health metric, and the hold that waited on it was
  argued from a prediction that turned out wrong.** The figure recorded before four sections landed
  was twenty-nine easy reps cited by no page. The pass that waited for those sections measured it
  again and found **the same twenty-nine slugs, identical slug for slug**, across a corpus that had
  grown by 65 reps. The new sections cited every rep they brought and picked up two previously
  uncited ones. So the number was never measuring drift: it was counting a floor of reps that are
  uncited by design, and it only ever named the easy tail, where 83 of the 112 uncited reps are
  medium or hard. The method was sound and the argument for holding, that every section still to be
  written moves the answer, was wrong by two reps. That is worth recording so the next hold is
  justified on something other than expected movement. **What replaces it is the direction nothing
  enforces**, practice volume with no page behind it, which has now been run and found clean: every
  category with volume and no page is one of the four already-recorded refusals, and at the model
  level rather than the category level, the seven models with reps and no page have one rep each.

  **A rep joins a `practise` list only where the page carries the model that makes the rep pass.
  Symptom-matching is refused.** The worked example is `dep-devdependency-at-runtime`, which produces
  the same `Cannot find module` on CI as the first trap of `dependencies/the-tree-is-not-the-list`
  and for an unrelated reason: a reader sent from that trap to that rep answers "phantom dependency"
  with confidence and is wrong. That rule is what found seventeen real omissions while leaving
  ninety-five reps uncited on purpose, and it is the operational form of the standing rule that a
  `practise` list padded until every rep appears somewhere makes the handbook an index.

  **A section `order` is a reading order, not an insertion log.** Four sections had been slotted in at
  8.5, 13.5, 17 and 18, which records when each arrived, and git already holds that. They are
  consecutive integers now, and `isolation` moved out of the run about a request (moving-data,
  headers, security, caching, apis, sql, databases) into the run about what code runs inside
  (server-runtime, unix, isolation, systems). Two things were already true and unwritten:
  `unix/your-server-is-a-process` and `isolation/what-a-process-gives-you` sat five sections apart
  sharing a rep, and `isolation/running-code-a-model-wrote` pointed forward to `ai-engineering` from
  eight sections back. **A reason for adjacency is not a reason to interrupt a longer arc**, which is
  what "isolation is a security property" had been doing.

## The essentials path

- **ADR-0087 — It is a second entrance, not a setting on the daily session.** Everything else here is judged
  against a 15-minute morning, and the path is deliberately not: it is the weekend-or-evening mode.
  The morning queue stays interleaved and spaced because that is what retention wants; an hour on
  the path is blocked and ordered because that is what building a model the first time wants. Making
  either one a mode of the other would blur two jobs that are correct at different stages.

- **ADR-0088 — Where you left off is derived from the reps, and nothing is stored.** A step whose problem is
  solved is done, and the first step that is not done is where you are. That keeps page-level
  completion a standing non-goal, and it means the feature shipped with no schema change and no
  migration. If a path ever wants its own progress model, that is the signal it has drifted from
  being an ordering into being a second app.

- **ADR-0089 — The subset rule is enforced mechanically, because it is the one that will get broken.** The path
  is a recommendation, and a recommendation that eventually names every page is an index. Good
  intentions do not survive seven more sessions, so `paths.spec.ts` fails if the sessions between
  them cite three quarters of the handbook. The number is a tripwire rather than a target: it should
  fire as a conversation about what to cut, long before anyone notices the path has stopped
  recommending anything.

- **ADR-0090 — Read, then prove, then build is enforced by the loader, not left to authors.** The reps come
  after the pages that explain them, which is the exact opposite of the daily queue's job, and it is
  the only structural rule the format has. A rule that is the whole point of a format is worth a
  check rather than a sentence in a README.

- **ADR-0091 — Seven hours shipped, and the test the path was meant to run for modules came back split.** The
  async hour was built entirely from existing pages and reps, without once wanting to teach an API
  from scratch, which by the stated criterion is evidence that the `promises` module matters less
  than assumed. But `query-params` and `dates`, the two areas the module list targets hardest,
  produced no candidate hour at all: twenty reps between them and nothing to read first, so there is
  no read step to write. An API with no model to explain does not become an hour, and that is the
  module spec earning itself. Note which direction the evidence can run: authoring the path can
  demote a module, never promote one, because a slice that fits an hour is model-shaped by
  construction.

- **ADR-0092 — A session with no fitting workout is 45 minutes, not an hour padded with one.** Two of the seven
  end on reps, because reaching for a workout that half-fits would cost the hour its coherence and
  teach the wrong lesson about what the path is for.

- **ADR-0093 — The reading reps are not a session, and reading is not a category.** Twelve reps that hand you
  unfamiliar code and ask what it does now sit in the categories their snippets belong to, and the
  obvious next move, an hour on the path, does not survive the format's own rules. A session is named
  by the question its hour answers, and "what does this code do" is a posture rather than a slice of
  the work. There is nothing to read first, because reading is a skill rather than a model several
  reps share, so the read step could only be padded with pages about whatever the snippets happen to
  touch. The order would carry no meaning either, since no reading rep builds on the one before it.
  What is missing is an entrance rather than an ordering, and that is application code: roadmap §1.

- **ADR-0094 — The reader sees "Essentials"; the code says "path".** The route is `/essentials` because that is
  what the thing is to someone deciding how to spend an hour, and everything behind it, the package,
  the API and the types, is `path`, because that is the word the spec and the docs use. One
  translation, at the boundary, written down here so it is a decision rather than a drift.

## Modules

- **ADR-0095 — Modules and the essentials path stay separate, and the reason is what you arrive knowing.**
  They look alike from outside: both are guided sequences longer than one rep, both need a route, and
  both refuse progress tracking. But a path is assembled from pages, reps and workouts, and all three
  assume you already know the thing. A module is the only format for the API you use constantly and
  understand shallowly. Merging them would mean either the path starts authoring material, at which
  point it no longer just orders what exists, or modules lose their steps and become a page plus reps,
  which the handbook already is. They differ on every axis that matters: 15 to 25 minutes on one API
  against an hour across a slice, and creating content against ordering it.
- **ADR-0096 — What they do share is machinery, and that gets consolidated instead.** One sequence viewer, where
  a module is a sequence of predict-run-correct steps and a session is a sequence of steps that may be
  pages, reps, workouts or a whole module. The shared non-goal is stated once: neither introduces
  progress tracking.
- **ADR-0097 — The path shipped first, and was the test of how many modules are needed.** It adds no content;
  modules are eight of them at 10 to 20 authored steps each, plus a content type and app code. What
  the test returned is recorded above: the async hour worked from existing pages and reps, and
  `query-params` and `dates` produced no hour at all. Read the module list with that in mind rather
  than as eight equal entries.

- **ADR-0098 — The format shipped as specified, and the two rules experience added are in `content.md`.**
  Building `js-date` found both: assertions run on the reader's machine with no fake clock and no
  fixed timezone, so a module that depends on its author's zone is broken for everybody else; and a
  step's assertions are about the API rather than about the reader's edit, which is what makes the
  snippet safe to change and explore. Neither was in the spec, and neither is discoverable from a
  module that happens to have been written in UTC.

- **ADR-0099 — The run endpoint takes the code and looks the assertions up itself.** The client sends what is in
  the editor; the assertions come from the step on disk. That is the split the format needs: the
  snippet is yours to change and the check does not move when you change it.

- **ADR-0100 — A `module` step on the essentials path became legal the day modules existed**, which cost the one
  case in a switch it was reserved to cost. It counts as a read step, because it is what a session
  about an API has instead of a page.

- **ADR-0101 — A fourth content type was accepted even though it costs application code.** The other three all
  assume you already know the thing you are practising. The gap they miss is the handful of APIs
  used constantly and understood shallowly, where the problem is not being stuck but holding a wrong
  model that has never cost enough to notice. Predicting, running and being corrected is what fixes
  that, and no existing format does it.

- **ADR-0102 — A step that cannot pose a question with a definite answer is a handbook page and belongs
  there.** That is the whole boundary between the two formats, and it is what stops a module turning
  into prose with a run button.

- **ADR-0103 — Module code lives in tagged fences, not in frontmatter.** The handbook's YAML parser takes
  strings, lists of strings and lists of flat objects, and teaching it block scalars so it could
  hold source would be the wrong trade. A tagged fence is already valid markdown and renders on
  GitHub.

- **ADR-0104 — Modules get no progress tracking and do not touch the review ladder.** The problems are the
  progress tracking, as with pages. A wrong prediction is exactly the signal the ladder wants, which
  makes wiring it in worth revisiting with real data and a migration rather than building
  speculatively.

- **ADR-0105 — Not a course platform.** No enrolment, no certificates, no percentage complete, no streaks, no
  video or audio. No branching either: steps are linear, and a module that needs a decision tree is
  two modules.

## Navigation, and what the first page asks

- **ADR-0106 — The nav carries four entries and none of them is a content format.** It had grown to nine, one
  per format plus the dashboard, which is what a nav does when every shipped thing is added to it:
  a morning opened on nine choices, of which one was the one worth making. The four are the four
  questions somebody actually arrives with. Today is what to do now, Library is where everything is,
  Handbook is what to read, Progress is how it is going. The rule that keeps it at four is that a
  new format earns a slot only by being a different question, and no format has been.

- **ADR-0107 — Today asks one thing, and it starts the session rather than linking to a page that asks more.**
  The old dashboard led with a scoreboard and put the session behind a card that then wanted a size,
  a category and a difficulty before anything began. That is three decisions and a report in front of
  fifteen minutes. The scoped form still exists on `/session` for when the scoping is the point; it
  is the second button, not the first.

- **ADR-0108 — The other formats are ranked by what they cost you, not by what they are.** On a morning the
  question is never "module or workout", it is how long there is, so each tile carries the duration
  the content itself declares and nothing rounds or estimates. Cards show a count instead, because a
  run has no authored length and inventing one would be the first invented number in the app.

- **ADR-0109 — Progress is a page you visit, not a page you land on.** Every number that was on the dashboard is
  still there and several that were computed and never shown now are, including the difficulty split.
  Moving them was the point: coverage is worth reading weekly and is worth nothing at the moment you
  sit down to work, and a reset button belongs nowhere near a page opened every morning.

- **ADR-0110 — The library is one page with tabs, and the list routes moved into it.** `/problems`,
  `/workouts`, `/modules` and `/essentials` redirect to their tab; the detail routes keep their
  top-level URLs, because a link to a workout is the workout and not a position in a browse surface.
  A menu of menus was the alternative and is what a library page usually degrades into: this one
  shows the content, and each tab is one click from the others rather than one click from an index.

- **ADR-0111 — Cards are not a library tab.** There is nothing to list, since choosing a deck was refused for
  the reason in the next section, so cards stay an entrance on Today. This is the same rule the decks
  decision made, applied to the page that would otherwise quietly reintroduce the choice.

## Decks

- **ADR-0112 — Decks are never surfaced in the UI, and the reason is the count of entrances rather than
  anything about decks.** The app already offers problems, essentials, the handbook, workouts and
  modules. Landing on a list of decks would put a second decision in front of someone with fifteen
  minutes, before they have answered anything. So `/cards` is the run itself, over every card there
  is, and the deck survives as the authoring unit and the thing that anchors a card to the page it is
  checked against. This finishes the translation the next entry starts: the reader does not see the
  word "deck" at all. Two consequences worth knowing. Shuffling stopped being optional, because one
  pile in file order opens on the same card every morning, and the summary has to credit pages and
  reps across whichever decks a run happened to deal from. The run is the whole library today, which
  is a few minutes; somewhere past a few hundred cards it stops being a sitting, and bounding it is a
  real change to make then rather than now.

- **ADR-0113 — Cards are self-graded.** You flip, you say whether you had it, and the app takes your word.
  Reusing the `short-text` matcher was considered and declined: free recall of a phrase is exactly
  where a matcher is wrong often enough to matter, and being marked wrong on an answer you knew is
  the fastest way to stop opening a deck. Auto-grading is not foreclosed by this. A deck whose
  answers really are single strings could take one optional field per card later, and nothing about
  the format stands in the way.

- **ADR-0114 — v1 persists nothing: no table, no migration, no write path.** The reps a deck cites are the
  progress tracking, as they are for modules and pages. The binding precedent is in the section
  above: modules get no progress tracking and do not touch the review ladder, and wiring the ladder
  in waits for real data and a migration rather than being built speculatively. A self-graded card is
  a weaker signal than a failed module prediction, so if modules wait, cards do not skip the queue.
  Revisit when a deck has been in use for a few weeks and its owner can either name the cards they
  keep missing or is annoyed that the app cannot.

- **ADR-0115 — The roadmap's deck table went stale for two commits, and the fix is a habit rather than a
  process.** Four decks shipped in one commit; the table lost one row and kept two whose decks had
  shipped under different slugs, `the-four-equalities` and `the-cache-directives`, while
  `freshness-and-validation` was never listed at all. Nothing caught it, and nothing can: the suite
  validates decks against the handbook, not against a prose table, and a test that compares the two
  would be a test asserting one document matches another. So the rule is the one the top of this file
  already states, applied harder. **The directory is the inventory and the table is a guess at a
  name.** Read `packages/decks/content/` before believing a row, and the same for
  `packages/modules/content/`, `packages/handbook/content/` and the seed files.

- **ADR-0116 — A deck is one JSON file, not one markdown file per card.** A module step is prose plus a runnable
  snippet and genuinely needs a file; a card is two sentences, and eight files with frontmatter for
  sixteen lines of text is ceremony. The size caps then do authorial work rather than merely bounding
  a field: a back that does not fit on one line is a card that has become a page, and the page is
  already cited.

- **ADR-0117 — The reader sees "Cards"; the code, the package and the API say "deck".** The same boundary
  translation as Essentials and `path`, for the same reason. "Cards" is what the thing is to someone
  deciding how to spend ten minutes, and "deck" is the word the content and the types use.

- **ADR-0118 — The suite cannot check whether a card is true, and the format is built around that gap.** A
  module's assertions run against its own snippet, so a module that teaches something untrue fails
  the build. A card has nothing to run. That is why `page` and `sources` are required rather than
  optional, and why the review rule is that every claim on a card must be checkable against the page
  it cites.

## Grading and safety

- **ADR-0119 — The expected result is executed at grade time, never stored.** Storing expected rows would make
  grading quietly wrong the moment the seed data changed, and the seed data is meant to keep
  changing.

- **ADR-0120 — SQL answers compare raw row values, so column names and aliases never matter.** Column count
  does, numbers compare numerically and everything else by string equality. The exercise is the
  query, and failing someone for naming a column differently would grade the wrong thing.

- **ADR-0121 — The practice dataset is literal and deterministic, and its shape is a requirement.** No
  randomness, because stable data makes debugging sane. Constraints on the values themselves, such
  as distinct prices where a problem asks for the most expensive rows, are what give a question
  exactly one right answer.

- **ADR-0122 — User SQL runs against `practice.db` opened readonly, and `ATTACH` is refused**, so `app.db` is
  unreachable from an answer. This is the one boundary in the app that is real rather than
  conventional, and it stays that way.

- **ADR-0123 — `node:vm` in the code runner is an isolation convenience, not a security boundary.** Determined
  code reaches the host realm through constructor chains. That is acceptable because Hone runs
  locally and executes only code the user typed, which is the same trust level as `pnpm dev`. Do not
  reuse `grading/code-runner.ts` to run code from anyone else.

- **ADR-0124 — The code runner's realm has no Node in it, and that caps what a `node` rep can be.** The vm
  context exposes `console`, the timer pair, `queueMicrotask`, `structuredClone`, `URL`,
  `URLSearchParams`, the text encoders and `AbortController`, and nothing else: no `require`, no
  `Buffer`, no `process`, no `setImmediate`, no streams. So nine of the ten reps about the runtime
  are `short-text` or `explain`, because the only honest way to grade "what does `process.nextTick`
  do first" here is to ask rather than to run. Widening the realm was the obvious alternative and is
  declined: every global added is another surface the isolation convenience above has to be reasoned
  about, and the reps that would benefit are the ones whose lesson is ordering, which a grader
  observes no better than a reader does. **A rep about a Node API that must actually execute belongs
  in a workout**, where the real runtime is already there.

- **ADR-0125 — The code runner has two budgets, because a script holding the thread and a test waiting on a
  timer are not the same problem.** `CODE_TIMEOUT_MS` is one second and bounds synchronous
  execution, which is what stops `while (true) {}`. `SETTLE_TIMEOUT_MS` is three seconds, bounds an
  awaited test, and caps any delay the submission asks a timer for, so nothing it schedules can
  outlive the deadline that would report it. One number used to do both, which meant `code-debounce`
  spent a tenth of the guard against endless loops simply doing its job: it sleeps around 110ms on
  purpose, because a debounce that cannot use real timers is not a debounce.

- **ADR-0126 — Those sleeps were suspected of being the flake and are not, and the reasoning is the rule for
  the next rep about timers.** Node runs expired timers in expiry order and drains microtasks after
  each callback, so a starved loop delays every timer and reorders none. Each sleep therefore sits
  on the settled side of the delay it waits out or waits through, and no pair of them is a race.
  Measured rather than argued: 872 grades run under three concurrent server suites plus every
  `pnpm verify` check, load that stretched the suite from 83s to 206s, produced no failures, a worst
  grade of 191ms against 110ms nominal, and a worst loop stall near 70ms against a three-second
  deadline. **So a js-code test may sleep on a real timer, provided the sleep is not racing another
  timer**, and a rep that would need one to win a race is asking for a fake clock and therefore for
  a workout.

- **ADR-0127 — `ts-type` asserts on type identity, not on assignability, and the gap between them is the
  `close` verdict.** Two types being assignable in both directions is a weaker claim than being the
  same type, and the two ways to land in that gap are the two ways to write a type that looks right:
  reaching for `any`, and writing a mapped type that forgot to strip a modifier. Grading either
  `correct` would teach that the imprecision does not matter, and grading either `incorrect` would
  say nothing about what went wrong. So identity passes, mutual assignability without identity is a
  near miss that reads amber and counts toward `close`, and the feedback says which of the two
  happened. Identity is checked with the deferred-conditional trick from
  microsoft/TypeScript#27024, which is the only way to reach the checker's internal identity
  relation from type syntax.

- **ADR-0128 — The type grader never runs the submission, so its boundary is the filesystem instead.** Nothing
  executes, which makes it a stronger boundary than the code runner rather than the same one
  restated. What replaces it is that `tsc` will happily follow an import, a `/// <reference path>`
  or a `@types` lookup. A `CompilerHost` is the compiler's only door to a disk, and this one answers
  exclusively from an in-memory map: two synthetic files and the lib closure loaded once at startup.
  `resolveModuleNameLiterals` returns nothing for every import. A test points a reference directive
  at a file it has just read itself and asserts the compiler reports it missing.

- **ADR-0129 — The lib is ES2022, and that caps what a `ts-type` rep can be**, exactly as the bare vm realm
  caps a `node` rep. No DOM, no `@types/node`, no imports. A rep that needs a real library type is
  asking for a workout.

- **ADR-0130 — There is no timeout on a type check, and one was tried.** The compiler API takes a
  `CancellationToken` on `getSemanticDiagnostics`, but it is not polled finely enough to interrupt
  the pathological case: a token already past its deadline never fired. It does not need to.
  TypeScript's own instantiation-depth, recursion and union-size limits bound the work themselves,
  and a deliberate 160,000-member template literal union errors out as TS2590 in about 45ms. The
  measured cost that did matter was startup: parsing the 57 lib files takes roughly 250ms, so they
  are parsed once and the `SourceFile` objects are shared across compilations, which takes a grade
  to single-digit milliseconds. Sharing them is safe only because a compilation is synchronous end
  to end, so two programs never hold the same file at once.

- **ADR-0131 — The workout workspace is not a security boundary either.** The path-escape guards exist to catch
  mistakes, not attackers.

- **ADR-0132 — `streaming-export-express` listens on no port at all, and that is the pattern to copy.** The
  recorded gotcha about handing supertest a listening server solves the `TIME_WAIT` failure; this
  workout avoids the question by wiring an in-memory duplex pair into a real `http.Server` through
  `server.emit('connection', …)`. Two things fall out. The socket failure mode has no surface, rather
  than being handled correctly. And the kernel leaves the measurement: loopback socket buffers absorb
  megabytes of an unread response, which would make a peak-bytes threshold depend on the operating
  system running it. **Where a checkpoint asserts on a number the network can move, take the network
  out** rather than picking a threshold loose enough to survive it.

- **ADR-0133 — The solution is held back until the problem is solved or three attempts have gone in**, and
  revealing it marks the problem skipped rather than solved. Answering before you see the answer is
  the mechanism, and a reveal that cost nothing would remove it. Checkpoint hints appear only after
  that checkpoint has failed, for the same reason.

## Attribution and sources

- **ADR-0134 — Every handbook page cites at least one source, enforced in `pnpm verify`.** The material traces
  to other people's teaching, and some of it traces to nothing at all: machine-written guides, and
  years of shortlinks with the original authors stripped off. Republishing that silently would take
  credit the project has not earned, so the fix is structural rather than a matter of good
  intentions.

- **ADR-0135 — Paywalled sources shape a page and never carry a claim.** A paid course gets credited for the
  material it shaped, but every claim has to be checkable against an open reference, and a claim
  with no open reference does not ship. In use this went one step further: paywalled courses ended
  up not credited on pages at all, because no claim ever rested on one.

- **ADR-0136 — LLM-generated source material does not count as a source.** Pages built from a machine-written
  guide verify each claim against primary references and cite those. The note itself is never the
  citation, however useful it was to write from.

- **ADR-0137 — No link shorteners, ever.** A shortlink is resolved to its canonical target before it can be
  cited, and if it is dead or its author cannot be identified, the claim is re-sourced or dropped.
  Links rot faster than expected: two of the learning-techniques citations had already gone by the
  time they were checked, which is why every paper citation carries its DOI in plain text.

- **ADR-0138 — The about page says plainly that the content is largely machine-written and reviewed
  progressively.** The test suite guarantees that every canonical answer grades correctly and every
  workout solution passes its checkpoints. It cannot guarantee that an explanation or a page is
  true, and implying otherwise would be the same failure the citation policy exists to prevent. This
  is why accuracy is a writing rule and not only a research one.

- **ADR-0139 — Claims about the app get checked against the file that implements them.** Writing the
  learning-techniques page contradicted several descriptions of the app that had read as harmless
  summaries. The review ladder does not widen on any correct answer and reset on any wrong one: it
  widens only on a review of a problem already solved, resets only when a review is failed, and does
  nothing to a problem never solved. Interleaving is not in the queue builder at all; the
  round-robin across categories is baked into `position` at seed time.

- **ADR-0140 — Expanding review intervals are not evidence-based, and the project says so.** Spacing has the
  evidence, the expanding shape is a choice, and the 1, 3, 7, 21, 60 ladder is a guess. Karpicke and
  Roediger tested expanding intervals against equally spaced ones and found expanding better ten
  minutes after learning and worse two days later, which is the direction that matters for a review
  schedule; Cepeda et al. add that the best gap depends on how long you want to retain the material,
  which a fixed ladder ignores. This one is worth guarding, because the temptation to reassert it
  recurs: conceding the numbers while borrowing authority for the shape is the subtler version of
  the thing the about page exists to avoid.

- **ADR-0168 — A study-skills course was read for ideas and gave back one.** iCanStudy teaches
  learning technique rather than a subject, and reading it was worth an hour: the output of that hour
  is mostly a list of decisions this project had already made, which is the normal and useful result.

  **What it confirmed rather than added.** Spacing, interleaving, retrieval practice and
  predict-before-reveal are all here already, from the same literature: the review ladder, the
  category round robin baked into `position` at seed time, the queue itself, and a module step.
  Arriving at the same four from a different direction is evidence the structure is right, and no
  reason to change anything.

  **The one idea taken is the diagnostic.** The course opens by assessing habits before teaching
  anything, and this app has never asked what you are bad at while holding the data to answer. It
  does not become a row of its own: it is a second question asked of the attempt history that
  `roadmap.md` already queues reading, and the difference is that the existing row asks which reps are
  weak content where this one asks which postures are weak in the reader.

  **What is refused, and mostly was already.** The effect sizes are the sharpest case and ADR-0140
  is the precedent: "half the time" and "80% less procrastination" are exactly the borrowed authority
  that entry exists to keep out, and conceding a number in passing is how it gets back in. The
  branded frameworks are mnemonics for a curriculum rather than models, and `WRITING.md` would refuse
  the prose before the content bar refused the idea. Method of Loci and mind mapping are encoding
  techniques aimed at bulk declarative recall, which is anatomy and pharmacology rather than why a
  cache did not invalidate. And the shape — thirteen stages, fifty hours of video, a percentage
  complete — is refused entry by entry already in ADR-0105 and the module non-goals.

  **The citation stance follows ADR-0135 without amendment.** It is a paid course, so it may shape a
  page and may never carry a claim on one. If any of this reaches the handbook the citation is the
  primary work, which for these four is Karpicke and Roediger, Cepeda, Bjork and Rohrer.

## Open-sourcing

- **ADR-0141 — The repo is public and MIT licensed, prose included.** One licence is simpler than two, and the
  crediting culture this project cares about lives in the citation policy rather than in licence
  text.

- **ADR-0142 — No CLA and no governance apparatus.** It is a personal project that accepts patches.

- **ADR-0143 — No hosted docs site.** The app and the repo are the artifacts.

- **ADR-0144 — The about and learning-techniques pages are hand-written React, not content.** They are two
  pages; a content pipeline for them would be machinery for its own sake.

- **ADR-0145 — Self-hosting was raised and declined.** The workout runner executes submitted code and `node:vm`
  is not a security boundary, which is fine on a laptop and a different proposition on a box with a
  public interface. Making it safe means real sandboxing, which is a project rather than a
  deployment, so Hone is not exposed on a network interface. If self-hosting returns it returns
  split: the read-only half has no code execution, no accounts and no user data, so publishing it is
  a static build and nothing more, while the full app stays local or behind a private network. What
  does not happen is the whole thing on a public interface because the handbook wanted a URL.

- **ADR-0154 — A hosted, client-only build was designed in full and declined, and the reason is the
  audience rather than the engineering.** The design: content baked into a static bundle at build
  time, which it already is on disk; `apps/web/src/lib/api.ts` reimplemented against local storage,
  which is the only module in the web app that calls `fetch`; the user tables onto SQLite compiled to
  WebAssembly so the queue and review-ladder logic survives instead of being rewritten by hand;
  `node:vm` onto a sandboxed frame; progress kept on device with export, import, and a user-picked
  file handle for backup. No accounts, no server, no capacity question.

  **It would have held ADR-0004 better than self-hosting does**, which is the opposite of how it
  looks. A static build cached after first load makes no runtime network call at all, while a
  self-hosted server puts an HTTP round trip on every grade. Local-first survives static hosting and
  dies at self-hosting.

  Two things were established on the way and are worth keeping whatever happens next. **Needing a
  daemon is one workout rather than a property of workouts:** `orders-migration-postgres` is the only
  manifest declaring `requires`, and most of the set is a library problem a browser can host. And
  **the ceiling that would have been permanent is not arbitrary, it is that a browser can host
  anything that is a library and nothing that is an operating-system fact.** PGlite serves one
  connection, which is ADR-0146 restated: the `55P03` lesson needs a second session to be refused and
  there is none. The same line cuts off the three sections the roadmap has not written yet, because
  isolation, Unix and production are processes, signals, namespaces and file descriptors, and a tab
  has none of those.

  Declined because the goal is a practice tool for the author and for people in the same position,
  and those people can clone a repo. The friction a hosted build removes is not friction for them; it
  is friction for a drive-by visitor who never returns, and everything this app is good at is
  longitudinal and therefore invisible in the ninety seconds such a visitor spends. What it would
  have cost is a second workout runtime validated in CI against the same solutions and starters for
  as long as both builds exist, or hosted grades quietly drift from local ones. That is a permanent
  tax paid to reach an audience the project does not have.

  **Self-hosting the server version is also worse than ADR-0145 says**, and the evidence belongs
  here rather than as a quiet edit to that entry. `node:vm` is the argument recorded there, and three
  more sit under it. `CurrentUserService` returns a hardcoded id, so every visitor is one account
  with one streak and one queue. `activeAttempt` finds one attempt per slug, so two people on the
  same workout share a workspace directory and overwrite each other's files with no locking. And the
  runner has no admission control of any kind, so concurrent runs thrash a machine and checkpoints
  exceed the scaffold's ten-second `testTimeout`. That last one is the sharp one: **overload here
  does not look like slowness, it looks like the content being wrong**, because a timed-out
  checkpoint reports as failed and tells somebody their correct answer is incorrect.

  Per ADR-0146's own lesson, the reversal condition is named rather than left implicit: reopen if the
  goal changes from a personal practice tool to reach, and re-derive rather than assume this entry
  was right, because the engineering here was never what decided it.

- **ADR-0169 — Progress moves between machines as a slug-keyed file, and the import merges.** Running
  Hone on a work laptop and a personal one wants progress to follow, and the obvious answer is to copy
  `app.db`. That answer is wrong, and quietly: every progress table keys on `problems.id`, an
  autoincrement assigned in seeding order, so a machine that seeded months ago and has upserted since
  holds different ids for the same slugs than a fresh seed does. Copied rows attach history to the
  wrong problems and nothing complains. So the file is keyed by slug and resolved on the way in, which
  is what `workout_attempts` already did by storing a slug rather than a reference.

  **Merge rather than replace, because either machine can be the one holding newer work.** Replace is
  simpler and makes the second machine read-only between exports, which is not what two machines are
  for. Attempts union on full-row identity, sessions dedupe on `createdAt`, and the review ladder
  follows whichever side has the later `lastSeenAt`. The rule worth recording is the one that is not
  "take the bigger number": `attemptsCount` is **recomputed from the merged attempt log** rather than
  maxed, because the log is the truth and a max is only ever conservative. `hintsRevealed` and
  `solutionViewed` take the max precisely because nothing reconstructs them.

  **Content is not progress and is not exported.** `problems` is rebuilt by `pnpm seed` and `users` is
  one hardcoded row, so including either would only give a stale file a way to overwrite current
  content. A slug the receiving machine does not have is named in the report rather than dropped,
  since the usual cause is the two machines sitting on different commits and the list says which way.

  **A CLI rather than a UI**, which is the ordinary bar rather than a principle: this runs twice a
  year, `pnpm seed`, `pnpm grade` and `pnpm workout` establish the shape, and a UI would add two
  routes and a file-upload path to be maintained for it. ADR-0154 describes export and import as part
  of the hosted build it declined; that was never built and this is not it — no round trip, no second
  runtime, no browser storage.

- **ADR-0185 — The rung an answer was given at is recorded now, and reading the history back waits
  for a ladder that has actually run.** The roadmap queued a report over the attempt history, and
  reading that history in order to scope it is what settled it. It holds one sitting: 124 answers
  inside 76 minutes, two problems with more than one attempt, and `review_count` at zero on all 128
  rows, which means not a single review has ever been answered. Of the four questions the row wanted
  to ask, one has two candidates, one has no data at all, one needs the ladder to have run, and only
  "the wrong answers actually submitted" has anything behind it. A report written against that could
  have been checked against nothing, which is the opposite of a row whose whole point is that the
  library improves with use.

  **What could not wait is the recording, and that is the whole finding.**
  `problem_progress.review_step` holds the rung a problem is on now, and a wrong review sets it to
  zero. So the fact the report needs, which interval a rep was missed at, is destroyed by the event
  that creates it. Replaying the ladder over the attempt log does not recover it either: `reset`
  deliberately keeps the attempts and throws the progress away, so a replay diverges on exactly the
  reps somebody cared enough to reset.

  **So `attempts.review_step` ships on its own.** Null on a first pass, and null on every row written
  before the column existed, which under-counts reviews rather than inventing them. `ExportedAttempt`
  carries it and a file without the field imports as null. The attempt identity key is untouched,
  because a rung is a property of an answer rather than of which answer it is, so ADR-0169's union
  still dedupes the way it did.

  **The general shape is worth keeping.** A feature that reads accumulated data has two halves on
  different deadlines. The reading half can wait indefinitely and is usually better for waiting. The
  writing half has one moment, which is before the data starts accruing, and it does not come round
  again. Splitting them is not a compromise between building and deferring; it is the only ordering
  that leaves the deferred half possible.

  Reopen once reviews have been answered. Nothing about the questions changes, and the UI half is
  still one prop on `HandbookLinks`.
