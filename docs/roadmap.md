# Roadmap

What is not built. A row leaves this file the day it ships, and nothing here is ever marked done or
struck through: a queue that keeps its own history stops reading as a queue.

The target is practical knowledge for web engineering and AI engineering, judged against a 15-minute
morning session, and content is never picked to complete a set. Why something was deferred lives in
[decisions.md](./decisions.md); how to write any of it lives in [content.md](./content.md).

## The rest of the decks

Two decks suggest themselves and cannot be written, both for the same reason: `page` is mandatory and
neither has one. No page owns the redirect codes, 301 against 302 against 307 against 308. Time
formats are a module rather than a page, because there was no model there to write down. A deck is
not on its own a reason to write a page, so both wait until something else asks for one.

**That wait is how a deck is meant to arrive, and there are six worked examples now.**
`four-ways-to-run-it-later` could not be written yesterday and needed no argument today, because a
page about `nextTick` and `setImmediate` was written for reps that wanted it, and the contrast set
was sitting inside the page once it existed. `three-promises-that-sound-alike` and
`embed-or-reference` arrived the same day as the pages they cite, and neither was the reason those
pages exist. So the rule holds in both directions: a deck does not justify a page, and a new page is
worth re-reading for the contrast set it just made checkable.

**Reading fifteen new pages for contrast sets produced three more, which is the second half of that
rule paying out.** `the-signal-family`, `kill-switch-or-traffic-switch` and `three-features-one-kernel`
cite pages written for reps, none of which was written with a deck in mind. A fourth candidate was
refused rather than written, and the reason is recorded rather than left as a gap. That read is done
and is not owed again until the next section ships.

**A third candidate arrived with `react/where-rendering-happens.md`**, unplanned, which is the way
the rule above says a deck is supposed to arrive. The contrast set is what React does when the two
passes disagree: loud (a text mismatch, every node up to the nearest boundary discarded), silent (an
attribute mismatch, never repaired, the server's value left on screen) and silent by request
(`suppressHydrationWarning`, which localises nothing). Unlike the two above it has a `page` to cite,
and every claim on that page was measured rather than read.

`packages/decks/content/` is the inventory, and a deck named there and not on disk is a name that
changed, not a deck that is missing.

## The end of the queue

**The content queue has run out, which was always the intended end.** The subject is practical
knowledge for web engineering and AI engineering judged against a 15-minute morning, and that is a
finite thing to cover. Everything past this is maintenance, which is a page going stale or a new API
worth knowing, and neither of those is a queue.

**The pass that was held until the sections landed has been run.** The uncited-rep count was
re-measured, the reps that wanted a page were offered to one, every section's `order` was read end to
end and renumbered, and the pairing rule was checked in the direction nothing enforces. ADR-0173
records what it found, including why the count the pass was built around is retired rather than
carried forward: it had not moved a single slug across four sections and sixty-five new reps, because
it was counting a floor rather than a drift.

## The server pass has a page and no reps

`react/where-rendering-happens.md` shipped and could cite only one `react` rep, because the category
holds 38 and none of them is about the pass that produced the HTML. The page's traps hand over three
candidates ready-made, all `explain` or `short-text` shaped and needing no new machinery: what a text
mismatch costs against what an attribute mismatch costs, what `suppressHydrationWarning` actually
leaves on the screen, and why `typeof window` is a worse fix than the crash it prevents. A workout is
refused rather than queued, and ADR-0172 has that argument.

## Depth per challenge

**The content queue has run out and none of this is more content.** What is left is that a green tick
is a weak claim. Every workout is entered cold, ends the moment its suites pass, and is never opened
again, so what a run proves is "the examples somebody thought of came back right". These five rows
are about making the same 38 workouts and 579 reps ask for more, and they are ordered by what they
return against what they cost.

- **Seven more generated checkpoints, and `alert-feed-sqlite` is the one to write first.** The audit
  the previous version of this row asked for has been done, and ADR-0167 records it along with what
  it refused. The queue, in order: `alert-feed-sqlite`, `one-recompute-not-fifty`,
  `retry-with-backoff-node`, `queue-consumer-node`, `class-places-sqlite`, `product-search-drizzle`,
  `records-sorting-drizzle`. **The first one is a better candidate than either workout that already
  has one**, because its property is already written down: `tests/support/walk.ts` walks the feed and
  `repeats` names anything handed over twice, and all four checkpoints run that on one dataset, one
  page size and one mutation at one fixed point. Varying the page size, where the tied timestamps
  sit and when the feed moves reaches the case a fixed `limit: 20` structurally cannot, which is a
  cursor carrying no id tiebreak. Three more have the contract and an argument about cost rather than
  about the contract, and they wait behind the seven: `outbox-relay-node`,
  `idempotent-payments-express`, `rate-limit-express`.

- **Read the attempt history back, which answers two questions rather than one.** 579 reps, a review
  ladder, and nothing ever asks what the outcomes say. It is a local report over local data, so
  ADR-0004 is untouched, and it is the only row here that makes the library improve with use rather
  than with authoring.

  **About the content**, three things are already in `app.db` and unread: a rep nobody misses twice is
  dead weight in a morning, a rep missed at every interval is an `explanation` that is not carrying
  its lesson, and the wrong answers actually submitted are the raw material for `nearMisses`, which is
  authored by guessing today.

  **About the reader**, which is the half that was missing until a study-skills course was read for
  ideas and gave back exactly one. It opens by assessing habits before it teaches anything, and this
  app has never asked what you are bad at despite holding the data to answer. Same query, second
  question: not which reps are weak, but which postures are — reading unfamiliar code, types, the
  debugging reps, whichever category the ladder keeps resetting. The tags line already exists to
  enter a posture on purpose, and nothing points you at one.

  **What that would change in the UI is one thing and it is small.** The two-way link is already
  built: a page names what practises it and `HandbookLinks` reads that backwards, so every problem
  already carries "Read about it". What it cannot do is weight itself. A rep you have missed at three
  intervals wants its page escalated rather than listed beside the answer at the same size as
  everything else, and that is the encoding half of this app finally being aimed by the retrieval
  half. It waits on the same data, which is why it is here and not a row of its own. See ADR-0168 for
  what else that course was read for and why almost none of it applies.

- **The rest of the AI-engineering track.** `tool-loop-node` is built, over a recorded in-process
  fixture rather than a fixture server: ADR-0174 records why the noun changed and what would reopen
  it. Two workouts are left and they are ordered. **Structured output and its repair path** comes
  next, and the fixture grows a `stopReason` of `max_tokens` with a truncated body and a
  schema-invalid response the model can be told about; the 429 carrying `retry-after` belongs here
  rather than in the loop, because resending a conversation without re-running the tools that already
  ran is its own lesson. **An eval harness** comes last, and needs recorded outputs over a fixed case
  set and nothing else new. What still holds either of them to a bar is ADR-0048: a fixture that only
  does the happy path teaches nothing a mock object would not.

## Platform

Content is the product, so this stays short. All of it is workout depth.

- **Attempt history per workout**: second and third runs are the point, so the UI should show the
  trend in time-to-green.
- **Multi-file tree** rather than a flat tab list. **The condition it was waiting on has been met**:
  `session-revocation-nestjs` ships eight files under `files/`, and a flat tab list stops being
  readable somewhere around there. This is now the platform row with an actual workout behind it.
- **Show what the code produced, not only whether it passed.** A checkpoint answers yes or no, and
  for most of the set that is the whole feedback a workout gives. The cases where it is thin are the
  ones whose subject is a shape: the JSON body an endpoint answered with, the rows a query returned,
  the markup a component rendered. `support-board-express` is the sharpest version, because its
  checkpoint reads the client's own parser and reports a path like `columns.0.cards.3.updatedAt`,
  which is one line of a payload nobody can look at.
  **The line to hold is that this is a transcript, not a preview.** What a suite already produces is
  serialisable: a failure message, a returned value, `prettyDOM` output. Surfacing that is one
  addition to the run report and one panel. Rendering a live component in an iframe is a second
  runtime, and it is application work per workout of exactly the kind the library is built to avoid.
  So the row is the first thing, and the second one is not queued.

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
- **A hosted build with the data in the browser**, designed in full and declined in ADR-0154. Not on
  capacity grounds: most workouts would port, and it would have held ADR-0004 better than a
  self-hosted server does. It is declined because the audience is people who can clone a repo, so the
  friction it removes is not friction for them. ADR-0154 also names what would reopen it.
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
