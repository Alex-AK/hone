# Writing guide

How Hone is written. This applies to everything a user reads: problem prompts, hints,
explanations, grader feedback, workout briefs, checkpoint hints, handbook pages, UI strings, and
the repo docs. It's written for two audiences at once: human contributors, and the LLM sessions
that produce most of the content. Both drift toward the same failure, which is prose that sounds
like writing instead of sounding like help.

## Who you're writing for

Someone mid-exercise, with a timer running and their attention on the problem. Your sentence is
an interruption. Earn it: say the one thing they need, then get out of the way. A hint is read at
the moment of being stuck. Feedback is read at the moment of failure. An explanation is read in
the thirty seconds after solving, which is the whole teachable moment. None of these situations
has room for a paragraph that clears its throat.

## Voice

Plain, direct, and confident. Write the way a good colleague talks at a whiteboard: contractions,
second person, present tense, and the point first. If a sentence could open with its conclusion,
open with its conclusion.

State facts as facts. Hedging belongs only where uncertainty is real, and then it should be
specific ("SQLite before 3.35 lacks this") rather than reflexive ("this may vary").

## Accuracy

This project's about page admits the content is largely machine-written and largely unreviewed.
That makes accuracy a writing rule, not just a research rule:

- Claim only what you verified: against official docs, against a cited source, or by running the
  code. If you can't check it, cut it.
- Numbers are exact or absent. "About 40,000 rows" only when the seed really makes 40,000.
- Lead with the symptom, then name the concept. "The second page repeats a row" teaches; a
  paragraph that opens with "keyset pagination" gets skimmed. This is the same rule
  `docs/content.md` sets for handbook traps, and it applies to hints and feedback too.

## Brevity, without terseness

Brevity means fewer ideas, not amputated sentences. Cut the information that doesn't change what
the reader does next; write what's left in complete sentences. A hint that names one thing beats
a hint that lists four. If a problem needs three caveats explained, the problem is trying to
teach three things, and that's a content bug, not a writing challenge.

One idea per sentence is a good default. So is deleting the last sentence you wrote and checking
whether anything was lost.

## Cut these

The tells that mark copy as filler, machine-made or otherwise:

- Warm-up openers: "It's important to note", "Keep in mind", "In this problem, we will". Start
  with the point instead.
- Cheerleading: "Great job", "Nice try", exclamation marks in feedback. The verdict is the
  feedback; enthusiasm from a grader reads as noise.
- Résumé adjectives: comprehensive, robust, seamless, powerful, crucial, essential, elegant.
  Also the verbs that come with them: delve, leverage, utilize, explore, dive into. Prefer is,
  has, use, read, run.
- "Simply" and "just". If it were simple, the reader wouldn't be reading a hint.
- Hedges on checkable facts: "typically", "in most cases", "should" when the actual behavior can
  be looked up or run. Look it up, then say what happens.
- Recaps. If the previous paragraph said it, the next one doesn't get to say it again.
- Three balanced items in every sentence. One triple can be load-bearing; a page of them sounds
  generated.
- Pet phrases and closing aphorisms: "is the point", "falls out of", "pays for itself", "the whole
  game", and the "X is not Y" line that ends a paragraph on a turn. One on a page reads as voice.
  Three read as a tic.

## Mechanics

- Sentence-case headings.
- Em dashes stay rare. Use a colon to introduce, commas or parentheses for asides, or a second
  sentence. The one em dash you keep should be doing real work. One structural exception: a
  `label — definition` pair at the start of a list item is a glossary pattern, not prose, and
  keeps its dash.
- Never strip em dashes with a bulk regex: it mangles paired-dash asides. Rewrite by hand and
  diff any sentence that contained a pair.
- Bold is for the rare load-bearing phrase. No emoji. Straight quotes.
- Prettier owns formatting; don't fight it by hand.

## Examples

Before and after, in this project's own content types.

A hint:

> Before: "It's important to remember that the dependency array plays a crucial role in
> determining when your effect re-runs, so you'll want to carefully consider which values you
> include in it."
>
> After: "The effect re-runs when a dependency changes. Something it reads isn't in the array."

Grader feedback:

> Before: "Good attempt! However, it's worth noting that `LIKE` patterns can potentially match
> unexpected rows because `%` acts as a wildcard character."
>
> After: "`%` is a wildcard in `LIKE`, so searching for 50% matches every name containing 50."

A brief:

> Before: "In this workout, we'll dive deep into the fascinating world of rate limiting,
> exploring various strategies and their trade-offs along the way."
>
> After: "Clients are hammering the export endpoint. Add a fixed-window limiter as middleware:
> 10 requests a minute per client, honest headers, and a window that actually turns over."

## Briefs don't give away the diagnosis

A workout is practice at working out what's wrong, not at typing a fix somebody already
described. So a brief states the **symptom and the requirement**, never the cause.

Write what the person reporting it would actually say. They can see the page is slow; they
cannot see that it runs a query per row. Naming the cause in the brief deletes the part of the
exercise worth doing, and it is the easiest mistake to make, because by the time you write the
brief you know the answer.

> Before: "The orders list reads all 40,000 rows, pages them in JavaScript, and fetches the
> customer name once per row. There's no index on `status` either."
>
> After: "The orders list took 40ms in staging and takes 9 seconds in production. Same code, same
> query, a hundred times the data. Get it under control without changing what the endpoint
> returns."

This applies to `brief.md` and to the manifest's `summary`, which is the first thing read and the
easiest place to leak the answer. It applies hardest to `bug-hunt` workouts, where the whole
exercise is the finding.

Three things stay explicit, because they're the task rather than the answer:

- **What must still be true when you're done.** Unchanged output, no new dependencies, the same
  API. Constraints are the brief's job.
- **Anything unguessable about the environment.** A fake's odd semantics, where the query log is,
  what `advanceTime` does. Withholding local trivia isn't difficulty, it's a scavenger hunt.
- **Checkpoint hints**, which are shown only after that checkpoint fails. That's the right moment
  to be specific, and they should be: name the one thing that's wrong.

## The test

Two questions, applied to every sentence. Would you say it out loud to the person sitting next
to you mid-exercise? And if you deleted it, would the reader do anything differently? A sentence
that fails both gets cut, whoever wrote it.
