---
title: Upgrading the model
question: I'm moving to a new model id. What actually breaks, and how would I know?
order: 10
practise:
  - ai-model-pinned-the-alias
  - ai-model-rollback-expires
  - ai-model-swap-green-suite
  - ai-embedding-model-mismatch
  - ai-eval-exact-match-reword
sources:
  - author: Anthropic
    title: Model IDs and versioning
    url: https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions
  - author: Anthropic
    title: Model deprecations
    url: https://platform.claude.com/docs/en/about-claude/model-deprecations
  - author: Anthropic
    title: Migration guide
    url: https://platform.claude.com/docs/en/about-claude/models/migration-guide
  - author: Anthropic
    title: Models overview
    url: https://platform.claude.com/docs/en/about-claude/models/overview
  - author: OpenAI
    title: Deprecations
    url: https://developers.openai.com/api/docs/deprecations
verified: 2026-08-09
---

[Updating a dependency](../dependencies/updating-a-dependency.md) opens with arithmetic: expand the
range, find the highest published version inside it, decide whether the fix is reachable. None of
that transfers here, because two things are missing. Nothing records what you actually ran, and
nothing tells you what a change is allowed to break. Every quotation below was read on the
`verified` date, and lifecycle dates move, so read the dates as the shape of the problem rather than
as a schedule.

## The model

**A model id is a version, not a lockfile.** The guarantee is real and it is narrow: "Each Claude
model ID identifies a pinned version of the model. When you use a model ID in an API request, the
underlying model remains constant for the lifetime of that ID." That is a promise about weights, and
the same page says what it leaves out. "Model weights are fixed for a given ID, but the serving
infrastructure around the model can change over time," meaning "the request router, safety
classifiers, and sampling logic," and "occasionally, infrastructure updates produce minor differences
in observable behavior even when the model ID and weights have not changed." A lockfile records a
tarball and refuses to install a different one. This pins one input to the thing you call.

**Whether the string in your config is pinned at all depends on which string it is.** Claude ids
before the 4.6 generation carry a date, `claude-haiku-4-5-20251001`, and the short form is "a
convenience pointer that resolves to the most recent dated snapshot for that minor version". From
4.6 the dateless id _is_ the snapshot, and the docs say so because people assume otherwise: "A common
misconception is that dateless model IDs such as `claude-sonnet-4-6` behave as evergreen pointers
that route to the latest or best-performing version. That is not the case." So one config line is
pinned and a neighbouring one moves under you, and the only thing that distinguishes them is a
naming convention. That is the entire lockfile you get.

**The end date belongs to somebody else.** Four states, and only one of them fails: a model is
active, legacy, deprecated ("still functional but no longer recommended"), or retired ("no longer
available for use. Requests to retired models will fail"). Notice periods are a published commitment
and they differ by an order of magnitude. Anthropic gives "at least 60 days' notice before model
retirement for publicly released models". OpenAI gives "at least 6 months" for generally available
models, "at least 3 months" for specialized variants, and retires preview models "with much shorter
notice, such as 2 weeks". The clock is also per platform: Amazon Bedrock and Google Cloud "set their
own retirement schedules, so a model's lifecycle status and dates can differ."

**The behaviour change that arrives passes every type check you have.** Anthropic states this about
its own deprecated parameters: "Deprecated parameters remain in the SDK request types so existing
code continues to type-check, but their behavior changes per model." Three that have shipped, none
of which raises anything:

- `thinking.display` stopped returning summarized reasoning and started returning an empty string,
  described in the migration guide as "a silent change". A UI rendering it now renders nothing.
- Thinking went from off by default to on by default, while `max_tokens` "remains a hard limit on
  total output, thinking plus response text". A budget sized around the answer now truncates it.
- A new tokenizer "may use roughly 1x to 1.35x as many tokens when processing text" for the same
  input, which moves the bill and the context budget without moving a line of your code.

Then there is the half nobody publishes a note about: shorter answers, a different refusal boundary,
a tool called less often. No type describes any of it.

**So the eval suite is the regression gate, and it is the only one.**
[Evals as tests](./evals-as-tests.md) answers how to test output you cannot predict. Read from this
end it answers something narrower, which is what the suite is actually for. A prompt edit moves one
thing at a time; a model swap moves every property at once, and the suite is the only artefact that
observes more than one of them. That has a consequence for how it is written. It has to record the
properties you would notice in production, not only the ones that can fail. Answer length is not an
assertion, and neither is whether the tool got called. Both are numbers to compare against the same
cases on the old id, and both are how a model change actually shows up.

**Rollback is a date rather than a command.** You can go back to the previous id right up until it
is retired, after which the requests fail. Anthropic has "committed to long-term preservation of
model weights" and "hopes to make past models publicly available again" at some point, which is a
statement of intent and not an endpoint. So the rollback window closes on a calendar somebody else
keeps, and once it has closed the fallback is a different model, which is a second upgrade nobody
has tested.

## Worked example

Run the suite against both ids and diff what moved. The graded properties come straight from
[evals as tests](./evals-as-tests.md); what is new is keeping the ones that are not pass or fail.

```js
async function profile(model, cases) {
  const rows = [];
  for (const testCase of cases) {
    const turn = await answer(model, testCase.question, testCase.documents);
    const allowed = testCase.documents.map((d) => d.id);
    rows.push({
      name: testCase.name,
      valid: gradeCitation(turn.text, allowed).pass,
      calledTool: turn.toolCalls.length > 0,
      refused: turn.stopReason === 'refusal',
      words: turn.text.trim().split(/\s+/).length,
    });
  }
  return rows;
}

const before = await profile(CURRENT_MODEL, CASES);
const after = await profile(CANDIDATE_MODEL, CASES);

const flipped = before
  .map((b, i) => ({ before: b, after: after[i] }))
  .filter(
    ({ before: b, after: a }) =>
      b.valid !== a.valid || b.calledTool !== a.calledTool || b.refused !== a.refused
  );

const median = (rows) => [...rows.map((r) => r.words)].sort((x, y) => x - y)[rows.length >> 1];
```

Three kinds of row, and they are read differently. `valid` going true to false is a regression and
fails the build, the same as it would on any other change. `calledTool` and `refused` flipping are
the changes that pass every type check: nothing errored, every structural assertion still holds, and
the only evidence is that the same case behaved differently. `words` is not a verdict at all. It is
a distribution you look at, because an answer half as long is a product decision somebody has to
make rather than a bug the suite can call.

The case list is the thing that decides whether any of this works, and the hard half is the cases
you expect to fail: the question the corpus cannot answer, the request that should be refused, the
one where the tool is the only way to the answer. A suite made only of questions with good answers
cannot tell you that the refusal boundary moved.

## Traps

**The suite went green and the complaints are about tone.** Structural assertions cannot see a model
that got terser, because a shorter answer still parses, still fills the required fields and still
cites only what it was given. Every assertion is satisfied and something real changed. The fix is
not a stricter assertion, which would fail on wording again. It is recording length, tool-call rate
and refusal rate per run so there is a previous number to compare with.

**You pinned the id and the behaviour moved anyway.** Weights are fixed for an id; the router, the
safety classifiers and the sampling logic around them are not, and a change there produces
"differences in observable behavior even when the model ID and weights have not changed". Before
going looking for a deploy that did it, check whether your config names a dated snapshot or a
pointer to one, because those are two different investigations.

**The rollback plan was the previous id, and the previous id was retired last month.** This is the
part people meet late, because it costs nothing until the day it costs everything. Read the
retirement date of the model you are rolling back _to_, not just the one you are on, and put it
somewhere it will be seen. Deprecated still answers. Retired does not.

**The bill moved and nothing calls the model more often.** Two independent causes and both are
invisible in a diff. The tokenizer changed, so the same prompt is more tokens than it was. And the
prompt cache is scoped to the model, so the first requests on the new id pay cache writes on a
prefix that was reading for a tenth the day before;
[prompt caching](./prompt-caching.md) has what invalidates a prefix. Re-measure with the provider's
token counting endpoint against the id you are actually calling rather than carrying last quarter's
numbers across.
