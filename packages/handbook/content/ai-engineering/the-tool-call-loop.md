---
title: The tool-call loop
question: The model asked to call my function. What has actually happened, and what runs next?
order: 4
practise:
  - ai-tool-call-has-not-run
  - ai-tool-results-one-message
  - ai-tool-schema-is-the-contract
  - ai-tool-authorization-boundary
  - tool-loop-node
  - auth-guard-nestjs
sources:
  - author: Anthropic
    title: Tool use with Claude
    url: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
  - author: Anthropic
    title: Handle tool calls
    url: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls
  - author: Anthropic
    title: Parallel tool use
    url: https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use
  - author: Anthropic
    title: Strict tool use
    url: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
verified: 2026-08-04
---

Giving a model tools does not give it hands. It gives it a way to ask, and the thing that turns an
ask into a refund, a deletion or an email is a loop in your code. This page is that loop, and the two
places it is dangerous.

## The model

**When the tool call arrives, nothing has been called.** The turn ends with a stop reason of
`tool_use` and one or more blocks carrying an `id`, the tool's `name`, and an `input` object shaped
by the schema you published. That is output. It sits alongside the model's text in the same response,
and the model cannot reach your database, your payment provider or the network. Your code decides
whether any of it runs.

**The loop is yours, and its format is not advisory.** Send the conversation, read the blocks, run
what you chose to run, send the outcomes back, and go round until a turn comes back without a call.
Every `tool_use` block gets exactly one `tool_result` carrying its `tool_use_id`, all of them
together in the next user message and ahead of any text in it; a call left unanswered is a malformed
conversation and the API says so. A call that threw comes back with `is_error: true` and a message
worth reading, because the model adapts to "rate limit exceeded, retry after 60 seconds" and cannot
do anything with "failed". A call you decided not to run is answered too, saying that.

Each turn resends the whole conversation plus every result so far, so a task that takes five calls is
six requests, each larger than the last. What that costs is the [cost page](./what-inference-costs.md)
subject; what it means here is that the loop needs a ceiling that is not the model's judgement.

**The arguments are structured output, and types are all they are.** With `strict: true` the sampler
is constrained to your schema, so `passengers` arrives as `2` rather than `"two"` and the tool name
is always one you defined. That removes a class of runtime error and none of the security question: a
perfectly typed `order_id` is still an id this user may have no right to. The permission check lives
in the handler, against the identity the session already carries, which is the same rule the
[MCP page](./mcp-servers.md) states for a tool exposed over a protocol.

**A tool result is untrusted input, and it is the injection surface people miss.** Results carry
content from places you do not control: web pages, inbound email, uploads, third-party APIs.
Instructions can arrive inside that content and be read as instructions, which is why the mitigation
is not a sentence in the prompt telling the model to ignore them. It is what the tool is allowed to
do. Scope the handler to the session, keep irreversible actions behind a confirmation, and assume
every argument was chosen by whoever wrote the page you just fetched.

## Worked example

The loop, with the only two limits that matter in it:

```js
const messages = [{ role: 'user', content: question }];

for (let turn = 0; turn < MAX_TURNS; turn += 1) {
  const reply = await model.complete({ messages, tools });
  messages.push({ role: 'assistant', content: reply.content });

  const calls = reply.content.filter((block) => block.type === 'tool_use');
  if (calls.length === 0) return reply;

  messages.push(toolResults(calls, run)); // one message, one result per call
}

throw new Error('tool loop did not settle');
```

And the handler the loop calls, where the interesting decisions are:

```js
function run(name, input, session) {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`No tool named ${name}`);

  const args = tool.schema.parse(input); // your schema, not the provider's
  return tool.handler(args, session); // session decides what it may touch
}
```

`MAX_TURNS` is the whole of your protection against a model that keeps asking, and `session` is the
whole of the authorization story: it comes from the connection, never from an argument, so there is
no `user_id` in any schema on this page.

## Traps

**The assistant told the customer their refund was on the way, and nothing was refunded.** A response
can hold text and a tool call together, and the text is written before the tool has run, so it
describes an intention. A handler that renders that text as the answer ships a promise nobody kept.
The reply the user sees is the one that comes back after the results go in, which is the turn that
ends without a call.

**The loop ran for ten minutes and the bill kept going.** Nothing in the protocol stops a model
asking for another call, and a loop with no ceiling will take one. Cap the turns, cap the size of a
result before it goes back into the conversation, and log the count, because a task whose turn count
climbs after a prompt change is the cheapest early warning you get.

**A page the tool fetched told the model what to do next, and it did.** The tool worked exactly as
written: it retrieved a document and handed it over, and the document contained instructions. There
is no parser that separates data from instruction here, so the control has to be somewhere the model
does not reach. Give each tool the narrowest scope that still does its job, and put a human in front
of anything you cannot undo.
