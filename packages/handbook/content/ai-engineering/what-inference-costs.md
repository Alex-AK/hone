---
title: What inference costs you
question: What does one call to a model actually cost me, in money and in seconds?
order: 1
practise:
  - ai-context-window-budget
  - ai-time-to-first-token
  - ai-idle-timeout-streaming
  - ai-retry-double-charge
  - ai-idempotency-key-choice
sources:
  - author: Anthropic
    title: Context windows
    url: https://platform.claude.com/docs/en/build-with-claude/context-windows
  - author: Anthropic
    title: Rate limits
    url: https://platform.claude.com/docs/en/api/rate-limits
  - author: Anthropic
    title: Pricing
    url: https://platform.claude.com/docs/en/about-claude/pricing
  - author: Anthropic
    title: Errors
    url: https://platform.claude.com/docs/en/api/errors
  - author: OpenAI
    title: Rate limits
    url: https://developers.openai.com/api/docs/guides/rate-limits
  - author: OpenAI
    title: Pricing
    url: https://developers.openai.com/api/docs/pricing
  - author: OpenAI
    title: Latency optimization
    url: https://developers.openai.com/api/docs/guides/latency-optimization
verified: 2026-08-02
---

A call to a hosted AI model is paid for by the amount of text that goes in and comes out, and how
long it takes depends mostly on how long the answer is. Neither works like an ordinary API. The
words the model writes cost several times what the words you send do, and a request your code gave
up waiting for may still have run to the end and been billed.

## The model

**The context window is one budget, shared by the prompt and the answer.** Everything in the request
counts against it: the system prompt, every message including tool results and images, and your tool
definitions. So does everything the model generates, including its reasoning. Cached content is not
free of it either, because caching changes what you pay for those tokens, not whether they count.

Two failures fall out of that, and they are not the same failure. Input that is already over the
limit is rejected before anything is generated, as a 400. Input that fits but leaves too little
behind is accepted, generates, and stops mid-answer with a distinct stop reason
(`model_context_window_exceeded` on current Claude models), which arrives as a 200.

Token counts are a property of the model rather than of your text. Claude 4.7 and later use a
tokenizer that produces about 30% more tokens for the same input than earlier models, so a budget
measured against last quarter's model does not transfer to this one. Count against the model you are
going to call.

**Output is the expensive token, by a ratio that outlives any price list.** Prices here were read on
the `verified` date and will move; the ratios move far more slowly. On every current Claude model
output costs five times input: Opus 5 is $5 and $25 per million tokens, Haiku 4.5 is $1 and
$5. OpenAI's current flagships hold six to one, from $5 and $30 down to $0.20 and $1.20. Both
providers price a cache hit at a tenth of base input.

Whether output dominates your bill depends on the shape of the call. A long prompt and a short
answer is input-heavy until you cache the prompt, and the cache is usually what tips it: a
five-minute cache write costs 1.25 times base input and a read costs a tenth, so it pays for itself
on the first reuse. On most Claude models cache reads also do not count against the input tokens per
minute limit, so caching buys throughput and not only money.

**Time is two numbers, and only one of them is yours.** Time to first token is queueing, prompt size
and the provider. The rest is output length divided by how fast the model generates, which is why
OpenAI's latency guidance says cutting output tokens in half may cut latency roughly in half. A p99
on total time pages you when somebody asks a question with a long answer, and that is not an
incident.

**A timeout tells you nothing about whether the work happened.** Anthropic's guidance for requests
over ten minutes is to stream or to batch, because a network that drops an idle connection makes the
request "fail or time out without receiving a response". Your client gave up. The generation did
not, and a blind retry is a second one, arriving while the dependency is already struggling.

## Worked example

One turn of an assistant with a cached system prompt and document, answering on Opus 5. The `usage`
field is where the bill is legible:

```json
"usage": {
  "input_tokens": 412,
  "cache_creation_input_tokens": 0,
  "cache_read_input_tokens": 18204,
  "output_tokens": 900
}
```

`input_tokens` counts only what follows the last cache breakpoint, so total input is the three input
fields added together: 18,616. Priced at the published rates, with cache hits at a tenth of base
input:

| Line           | Tokens | Rate         | Cost    |
| -------------- | ------ | ------------ | ------- |
| Uncached input | 412    | $5 / MTok    | $0.0021 |
| Cache reads    | 18,204 | $0.50 / MTok | $0.0091 |
| Output         | 900    | $25 / MTok   | $0.0225 |
| **Total**      |        |              | $0.0337 |

The 900 tokens the model wrote are 4.6% of the tokens moved and two thirds of the cost. Turn the
cache off and the same turn costs $0.116, three and a half times as much, entirely because of
18,204 tokens nobody typed.

## Traps

**The JSON stops mid-object and nothing errored.** The window filled. On current Claude models a
request whose input fits but whose input plus `max_tokens` exceeds the window is accepted, runs, and
halts with `stop_reason: "model_context_window_exceeded"`: a 200 with a truncated body. Read
`stop_reason` before you read the content, because a handler that parses `content` and trusts it
cannot tell a finished answer from a stopped one. The cause is usually growth you did not author,
since history and tool results grow every turn while the code asking for 500 tokens of output stays
the same.

**You tuned `max_tokens` on one provider and carried the number to the other.** It does not mean the
same thing on both. Anthropic evaluates the output limit in real time against tokens actually
generated, and says so: `max_tokens` "does not factor into OTPM rate limit calculations, so there is
no rate limit downside to setting a higher `max_tokens` value". OpenAI reserves against it instead,
where "your rate limit is calculated as the maximum of `max_tokens` and the estimated number of
tokens based on the character count of your request", and advises setting it close to the expected
response size. Neither charges you for tokens that were never generated, so this is a throughput
decision rather than a billing one, and the right value is per provider.

**The p99 is twelve seconds and nothing in the trace is slow.** Total time on a streaming endpoint
is mostly a property of the answer's length, so a long answer is indistinguishable from a degraded
service. Split them: alert on time to first token, which is the blank screen the user is looking at
and the part that moves when the provider degrades or your prompt grows, and track total separately,
because it decides how long a connection is held and what the call costs. The same confusion bites
on the way out, where one request timeout cannot separate a healthy long answer from a dead
connection, and the fix is an idle timeout alongside an absolute cap.
