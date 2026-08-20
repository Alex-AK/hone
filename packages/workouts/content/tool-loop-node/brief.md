# The tool-call loop

A customer asked support to refund an order that arrived four days late. The assistant told them the
refund was on its way. Finance has no record of it, and neither does the order.

## The task

One file: **`src/lib/agent.ts`**. `Agent.answer(question)` holds the conversation and hands back what
the assistant should say.

**Answer with the turn that stopped asking.** A reply can carry text and tool calls together, and
that text was written before anything ran. Keep going until a reply comes back with no `tool_use`
block in it, and hand back its text.

**Every call is answered, in one message.** A turn can ask for several at once. Run them, and send
one `tool_result` per `tool_use` in the next user message, carrying the same id and in the order they
were asked for.

**A call that failed is a result too.** Whatever a handler throws goes back on that call's id with
`is_error: true` and the message in the content. The calls beside it still run and still get
answered. So does a call you refuse: an unknown tool name, or arguments your schema rejects.

**Say what was wrong.** An error result is the whole of what the model has to work with. Name the
argument, not "failed".

**Nothing reaches a handler unchecked.** `call.input` is whatever the model wrote. Find the tool by
name in `deps.tools`, parse the arguments with `tool.input`, and only then call `tool.run`.

**Stop.** `maxTurns` is the most requests this may make, and running out throws
`LoopDidNotSettleError(turns)`. `maxResultChars` is the most characters one result may add, so cut a
long one down to that, keeping the front.

## What you are given

**`src/model/protocol.ts`** is the shape of the conversation: `Message`, the content blocks, and the
two errors the model answers with. `Model.complete({ messages })` is the one call that leaves this
code.

**`src/tools/registry.ts`** is the three tools. Each has a `name`, an `input` schema that is yours
rather than the provider's, and a `run(args, session)`. `run` takes `unknown` because nothing has
parsed the arguments by the time they reach you, so handing it `call.input` compiles.

**`src/tools/store.ts`** is what the handlers reach: the order book, the refund ledger and the policy
documents. A handler throws `NotYoursError` for an order the session does not own. `session` comes
from the signed-in connection, and no tool schema has a customer in it.

**`src/lib/errors.ts`** holds `LoopDidNotSettleError`, which the checkpoints assert on by class and
by `turns`.

## Notes

The model behind `Model` is a recorded transcript rather than a live provider. It samples nothing:
the same conversation always gets the same reply back, so the exercise is deterministic and nothing
here reaches a network.

It is strict about the conversation, and every refusal is one the real API makes. A `ProtocolError`
means the request was malformed: a `tool_use` nobody answered, two results for one call, a
`tool_result` answering nothing, or results that are not the first blocks in their message.

The context window is 2,000 tokens across the whole conversation, and a token is four characters of
the serialised messages. Every turn resends everything, so a long result is paid for again on each
one. Passing the window is a `ContextWindowExceededError`.

Retrieved documents were written outside this company. Anything in one that reads like an instruction
came from outside too.

Nothing is imported from outside these files except `zod`, which the registry already uses.
`npm`-style commands are not available: hit **Run checkpoints** to see where you are.

## If you finish early

- The loop is capped at turns. Work out what a cap on tokens spent would count instead, and which of
  the two you would rather be paged about.
- A result the model reads is a result somebody outside your company may have written. Decide which
  of these three tools you would put a confirmation in front of, and what the confirmation would have
  to show to be worth anything.
- `maxTurns` protects you from a model that keeps asking. Nothing here protects you from a model that
  asks for the same call twice in one turn. Work out what that would do to the refund ledger.
