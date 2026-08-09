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

`packages/decks/content/` is the inventory, and a deck named there and not on disk is a name that
changed, not a deck that is missing.

## The last pass, which is now due rather than held

**The content queue has run out, which was always the intended end.** The subject is practical
knowledge for web engineering and AI engineering judged against a 15-minute morning, and that is a
finite thing to cover. Everything past this is maintenance, which is a page going stale or a new API
worth knowing, and neither is a queue. What is left above is one row that is waiting on something
else, by design.

**One pass was deliberately held until the sections landed, and they have.** It is reading every
page's practise list against the whole problem set at once. The argument for holding it was that
every section still to be written arrives with its own reps and moves the answer, so doing it once
costs less than doing it three times. Four sections have now arrived with roughly thirty-five reps
between them, which is exactly the movement the hold was waiting on. There is nothing left to wait
for.

**The uncited count is stale and re-measuring it is the first step, not a footnote.** The figure
recorded here was twenty-nine easy reps cited by no page, six of them `query-params` reps, which is
the case that produced a module rather than a page and is the standing reminder that "uncited" is
not the same as "missing something". That number predates four sections and cannot be carried
forward. Measure it before reading anything into it.

The rest of the pass: every uncited rep offered to the pages it actually serves, each section's
`order` re-read now that the section is whole, and the pairing rule checked in the direction nothing
enforces, which is practice volume with no page behind it. Section `order` deserves particular
attention this time, because four sections were slotted in at 8.5, 13.5, 17 and 18 without the whole
sequence being read end to end. It is one sitting over finished content, not a rolling chore.

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
