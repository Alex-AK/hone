---
title: Evals as tests
question: How do I test something that answers differently every time I run it?
order: 8
practise:
  - ai-eval-exact-match-reword
  - ai-eval-assert-invariants
  - testing-implementation-details
  - testing-what-to-mock
sources:
  - author: OpenAI
    title: 'Evals: existing templates for evals'
    url: https://github.com/openai/evals/blob/main/docs/eval-templates.md
verified: 2026-08-02
---

Testing code that calls a model is awkward because the same question gets a differently worded
answer on every run, so checking for an exact reply fails for no useful reason. An eval is a test
suite built for that. Instead of matching the words, it checks what has to hold every time, such as
whether the reply parsed and whether it cited only documents it was given.

## The model

**Assert invariants, not wording.** The answer changes every run; that it parsed as JSON, filled the
required fields, cited only documents that were in the context, and stayed under the length limit
does not. Those are ordinary assertions, they pass or fail deterministically, and they catch most
real regressions.

**There is a ladder, and you climb it only as far as you have to.** OpenAI's evals framework names
the rungs, and the definitions are literally this small: `Match` is "does the completion start with
one of the reference answers", `Includes` is "does it contain one", `FuzzyMatch` is "does either
contain the other", and `JsonMatch` parses both sides and compares them as JSON, where key order and
whitespace outside values do not count and invalid JSON never matches. Most tests worth writing are a
structural assertion or a `JsonMatch`, and never leave this rung.

**Model-graded evals are the top rung and they cost what they cost.** When the output is genuinely
open-ended, you ask a model to classify it, with the evaluation prompt written so the answer is
parsable: a fixed set of `choice_strings`, optional `choice_scores`, and a chain-of-thought-then-
classify format so the choice lands at the end where you can find it. Anything outside the expected
choices is parsed as `__invalid__`. This works, and it means your test oracle is now the thing you
were trying to test. Use it where nothing cheaper fits, and keep a deterministic layer underneath it.

**The suite's job is regression, not a grade.** A number that goes up is less useful than a case that
went from pass to fail when someone edited the prompt. Prompts are code with no type checker: a
one-word change is a deploy, and the eval suite is the only thing standing where a test suite would
normally be.

## Worked example

A structural grader is a plain function, and the test around it is a plain table:

```js
function gradeCitation(raw, allowedIds) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { pass: false, reason: 'not-json' };
  }
  if (typeof parsed?.answer !== 'string' || parsed.answer.trim() === '')
    return { pass: false, reason: 'no-answer' };
  if (!Array.isArray(parsed.sources) || parsed.sources.length === 0)
    return { pass: false, reason: 'no-sources' };
  if (!parsed.sources.every((id) => allowedIds.includes(id)))
    return { pass: false, reason: 'unknown-source' };

  return { pass: true, reason: null };
}

it.each(CASES)('$name', async ({ question, documents, mustCite }) => {
  const raw = await answer(question, documents);
  const graded = gradeCitation(
    raw,
    documents.map((d) => d.id)
  );

  expect(graded.reason).toBeNull();
  expect(JSON.parse(raw).sources).toContain(mustCite);
});
```

Nothing here reads the wording of the answer. The last assertion is the one that earns its place:
a citation to a document that was never in the context is the cleanest evidence you have that the
answer was invented.

## Traps

**The suite is flaky, so people stop reading it.** Usually an exact-match assertion on prose, which
fails on a comma. Move down the ladder to a structural check, or up it to a model-graded one, but do
not leave a test that fails for reasons nobody acts on.

**The model-graded eval agrees with itself.** Grading a model's output with the same model, on the
same day, in the same style, measures less than it appears to. Fix the grader's version, keep the
prompt narrow and parsable, and hold a set of hand-labelled cases to check the grader against.
The framework's own advice is to inspect real completions before choosing a template, and that is
the step people skip.

**The suite has never failed.** Then it is asserting things that cannot break. Every eval set needs
cases you expect to fail, including the question the corpus cannot answer: a suite that only contains
questions with good answers cannot tell you that your system will make one up.
