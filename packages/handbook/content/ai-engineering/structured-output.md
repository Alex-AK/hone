---
title: Getting JSON out of a model
question: I asked for JSON and it came back inside a code fence. What am I allowed to trust?
order: 3
practise:
  - ai-json-came-wrapped
  - ai-structured-output-stopped-early
  - ai-eval-assert-invariants
  - ts-json-parse-any
  - request-boundary-zod
sources:
  - author: Anthropic
    title: Structured outputs
    url: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
  - author: OpenAI
    title: Structured Outputs
    url: https://developers.openai.com/api/docs/guides/structured-outputs
  - author: MDN
    title: JSON.parse()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse
  - author: JSON Schema
    title: Objects
    url: https://json-schema.org/understanding-json-schema/reference/object
verified: 2026-08-04
---

Asking a model for data instead of prose means getting text back and turning it into something your
program can use, such as an order with its fields filled in. Providers now offer modes that force
the reply into the right shape, and they help, but a reply can still stop halfway, refuse, or put a
value in a field that makes no sense. The place in your code where a reply is accepted as data is
where those get caught, or where they slip through into your database.

## The model

**Two different promises are sold under one word.** JSON mode says the output will parse. Structured
outputs say the output will match the schema you sent, and OpenAI draws the line in exactly those
terms: JSON mode ensures valid JSON is produced, and only Structured Outputs ensure schema adherence.
The mechanism behind the second is constrained decoding, which restricts what the model may emit next
to tokens the grammar allows, so the answer is well formed as it is written rather than checked
afterwards. It is the same machinery that backs `strict: true` on a tool definition.

**The schema the provider enforces is a subset of the one you wrote.** Anthropic's structured outputs
reject numerical constraints (`minimum`, `maximum`, `multipleOf`), string constraints (`minLength`,
`maxLength`) and recursive schemas outright, and require `additionalProperties: false` on every
object; an unsupported keyword is a 400 rather than a quietly weaker constraint. OpenAI takes the
numeric and string keywords on its standard models and supports recursion, but requires every
property to appear in `required`, so an optional field is expressed as a union with `null`. The same
schema file is therefore not the same guarantee at two providers, and neither of them is checking the
half you care about: that the SKU exists, that the lines add up to the total, that the delivery date
is not in 1970.

**Constraining the writing does not guarantee the finishing.** Two stop conditions end a response
early, and both arrive as a 200. The output cap truncates mid-token and leaves you a fragment.
A refusal is under no obligation to match the schema at all. So the parse stays fallible with the
mode switched on, and the stop condition is read before the content, which is the same discipline the
[cost page](./what-inference-costs.md) arrives at from the other direction.

What is left is an ordinary boundary, and you already know how to write one: parse to `unknown`,
validate with your own schema, and let the type come out of the validation, which is
[what the compiler erases](../typescript/what-the-compiler-erases.md) applied to a new caller. Two
things are different here. The failure rate is a few a day rather than a few a year, and there is no
misbehaving client to blame it on, so what happens on a rejected response is a product decision
rather than a 400.

## Worked example

One extraction, with the three ways it can fail kept apart:

```js
const reply = await model.complete({ schema: providerSchema, messages });

if (reply.stopReason !== 'end_turn') {
  return { ok: false, reason: 'stopped-early', stopReason: reply.stopReason };
}

const parsed = readJson(reply.text); // returns null rather than throwing
if (parsed === null) return { ok: false, reason: 'unparseable' };

const checked = Order.safeParse(parsed); // your schema, the one with the bounds in it
if (!checked.success) return { ok: false, reason: 'invalid', issues: checked.error.issues };

return { ok: true, order: checked.data };
```

Nothing in there throws, because a formatting habit upstream is not an exception in your request
handler. The three reasons are separated because they want different next moves. `stopped-early` is a
budget problem, so it wants a larger cap or a smaller ask rather than an identical retry.
`unparseable` is worth one more sample. `invalid` is the one that must not be retried blindly: the
model produced a document and got a field wrong, and the `issues` list is the only thing that makes
the second attempt different from the first.

## Traps

**The retry loop spends real money and returns nothing.** A response fails validation, the code sends
the identical request again, and because sampling is not deterministic it usually works, which is
exactly what makes the unbounded version so easy to ship. Then a prompt change makes one field fail
every time, and the loop discovers that at three attempts a request until somebody notices the bill.
Bound the attempts, and put the specific failure into the retry so the next attempt differs from the
last one. A field that fails identically every time is a disagreement between your schema and your
prompt, not bad luck.

**The schema your validator generated was rejected at deploy.** You piped the same schema object to
the provider that you validate with, and it 400s: on a `minLength` Anthropic will not compile, or on
an optional field OpenAI insists must appear in `required`. The fix is to stop pretending they are
one schema. Derive the provider's copy from yours, stripping what it cannot take, and keep validating
against the full one afterwards. The provider's schema is a shape; yours is the contract.

**The prompt said to reply with JSON and nothing else, and for a month it did.** Then a reply arrived
with a sentence of introduction, or wrapped in a code fence, and `JSON.parse` threw a `SyntaxError`
into a request handler that had no branch for it. An instruction in a prompt is a request, and the
model that grants it today is a different model after the next upgrade. Where the provider can
constrain the output, turn that on; where it cannot, salvage the object and return a value either
way. The parse at this boundary reports rather than throws, and that alone turns an outage into a
metric.
