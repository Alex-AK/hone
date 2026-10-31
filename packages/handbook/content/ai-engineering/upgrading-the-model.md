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

Switching an app to a newer AI model looks like changing one setting. Unlike upgrading a library,
nothing records exactly what you were running, and nothing tells you what the change can break:
answers get shorter, refusals move, a tool gets called less, and none of it raises an error. The old
model also has an end date somebody else sets, so going back is not always possible.

## The model

**A new model id changes behaviour that no type check and no lockfile records, so the eval suite is
the only regression gate you have.** None of the range arithmetic that
[updating a dependency](../dependencies/updating-a-dependency.md) opens with transfers here.

**A model id is a version, not a lockfile.** The guarantee is narrow: "When you use a model ID in an
API request, the underlying model remains constant for the lifetime of that ID." That is a promise
about weights. The same Anthropic page says the serving infrastructure around them (request router,
safety classifiers, sampling logic) can change over time, and occasionally produces minor
differences in observable behaviour even when the id and weights have not. A lockfile records a
tarball and refuses to install a different one. A model id pins one input to the thing you call.

**Whether the string in your config is pinned at all depends on which string it is.** Claude ids
before the 4.6 generation carry a date, `claude-haiku-4-5-20251001`, and the short form is a
convenience pointer to the most recent dated snapshot for that minor version. From 4.6 the dateless
id _is_ the snapshot, and the docs call it a common misconception that a dateless id like
`claude-sonnet-4-6` is an evergreen pointer to the latest or best-performing version: "That is not
the case." So one config line is pinned and a neighbouring one moves under you, and only a naming
convention tells them apart.

**The end date belongs to somebody else.** A model is active, legacy, deprecated (still working but
no longer recommended) or retired, and only retired fails. Notice periods are a published
commitment, and they differ. Anthropic gives at least 60 days before retiring a publicly released
model. OpenAI gives at least 6 months for a generally available one. These terms were read on the
`verified` date, and they move.

**The behaviour change that arrives passes every type check you have.** Anthropic keeps deprecated
parameters in the SDK request types so existing code still type-checks, while their behaviour
changes per model. Three that have shipped, none of which raises anything:

- `thinking.display` started returning an empty string instead of summarized reasoning, a change the
  migration guide calls silent, so a UI rendering it now renders nothing.
- Thinking went from off by default to on by default, while `max_tokens` stays a hard limit on total
  output, thinking plus response text. A budget sized around the answer now truncates it.
- A new tokenizer may use roughly 1x to 1.35x as many tokens for the same text, which moves the bill
  and the context budget without a line of your code changing.

Then there is the half nobody publishes a note about: shorter answers, a different refusal boundary,
a tool called less often.

**So the suite has to record what you would notice, not only what can fail.**
[Evals as tests](./evals-as-tests.md) answers how to test output you cannot predict. A prompt edit
moves one thing at a time; a model swap moves every property at once, and the suite is the only
artefact that observes more than one of them. Answer length and whether the tool got called are not
assertions. They are numbers to compare against the same cases on the old id, and they are how a
model change actually shows up.

**Rollback is a date rather than a command.** You can go back to the previous id until it is
retired, and after that the requests fail. Once the window closes, the fallback is a different
model, which is a second upgrade nobody has tested.

## Worked example

Run the suite against both ids and diff what moved. The graded properties come from
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

Three kinds of row, read differently. `valid` going true to false is a regression and fails the
build, as it would on any other change. `calledTool` and `refused` flipping are the changes that
pass every type check: nothing errored, and the only evidence is that the same case behaved
differently. `words` is a distribution you look at rather than a verdict, because an answer half as
long is a product decision somebody has to make, not a bug the suite can call.

The case list decides whether any of this works, and the hard half is the cases you expect to fail:
the question the corpus cannot answer, the request that should be refused, the one where the tool is
the only way to the answer. A suite made only of questions with good answers cannot tell you that
the refusal boundary moved.

## Traps

**The suite went green and the complaints are about tone.** Structural assertions cannot see a model
that got terser, because a shorter answer still parses, still fills the required fields and still
cites only what it was given. The fix is not a stricter assertion, which would fail on wording
again. It is recording length, tool-call rate and refusal rate per run so there is a previous number
to compare with.

**You pinned the id and the behaviour moved anyway.** Weights are fixed for an id and the serving
infrastructure around them is not. Before looking for a deploy that did it, check whether your
config names a dated snapshot or a pointer to one, because those are two different investigations.

**The rollback plan was the previous id, and the previous id was retired last month.** Read the
retirement date of the model you are rolling back _to_, not only the one you are on, and put it
somewhere it will be seen. A deprecated model still answers; a retired one does not.

**The bill moved and nothing calls the model more often.** Two independent causes and both are
invisible in a diff. The tokenizer changed, so the same prompt is more tokens than it was. And the
prompt cache is scoped to the model, so the first requests on the new id pay cache writes on a
prefix that was reading for a tenth the day before; [prompt caching](./prompt-caching.md) has what
invalidates a prefix. Re-measure with the provider's token counting endpoint against the id you are
actually calling.
