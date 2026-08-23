# Getting an object back

Refund triage runs off the model now. An email comes in, the assistant looks up what it needs, and
what comes out is meant to be a decision the refund queue can act on.

Three things came in from the last fortnight:

- Some tickets in the queue have a reason that stops mid-sentence.
- Some emails produce no ticket at all. The log says the answer was malformed, and the next line says
  the same thing about the same email, and the line after that.
- Monday morning was busy. One order was looked up eleven times.

## The task

One file: **`src/lib/triage.ts`**. `Triage.decide(question)` holds the conversation and hands back a
`Decision`. The loop from part one is already in there and works; what it does with the answer, and
with the two ways a request can come back unusable, is yours.

**The answer is a decision.** The turn that stops asking for tool calls carries JSON rather than
prose. Parse it, put it through `decisionSchema`, and hand back what comes out. Nothing that has not
been through the schema is a decision.

**An answer that does not fit gets one more go, and the model has to be told what did not fit.** Send
the reason back as a user message and ask again. `maxRepairs` is how many extra attempts there are,
and running out is a `NoUsableDecisionError(attempts, last)`.

**An answer that was cut off was not wrong.** `stopReason` is `max_tokens` when the reply hit the
completion limit and stopped where it was. Say so: tell the model the answer was cut off and ask for
the object on its own. This costs an attempt like any other.

**A rate limit is a wait.** A `RateLimitedError` carries `retryAfterMs`. Wait that long on
`deps.clock` and send the same conversation again, up to `maxWaits` times. Past that, let it out.

## What you are given

**`src/model/protocol.ts`** is the shape of the conversation, and it is part one's with two additions:
`stopReason` can now be `max_tokens`, and `RateLimitedError` carries the provider's own
`retryAfterMs`.

**`src/tickets/schema.ts`** is `decisionSchema`, which is what the refund queue accepts. A refund of
zero is a decision; it means no refund, and it still needs a reason.

**`src/lib/clock.ts`** records waits instead of taking them, so a checkpoint can read back what you
decided to wait without any checkpoint taking a second to run. Use it for anything that waits: a real
`setTimeout` waits in real time, which the checkpoints do not.

**`src/tools/registry.ts`** and **`src/tools/store.ts`** are part one's, unchanged. `store.ran`
records every handler that actually executed.

**`src/lib/errors.ts`** holds `LoopDidNotSettleError` and `NoUsableDecisionError`, which the
checkpoints assert on by class and by what they carry.

## Notes

The model is a recorded transcript rather than a live provider, and it samples nothing. It is strict
about the conversation in the same way part one's was: a `tool_use` nobody answered, two results for
one call, a `tool_result` answering nothing, or results that are not the first blocks in their
message are all a `ProtocolError`.

One thing about it is worth knowing before you start, because it is unguessable and it decides one of
the checkpoints. **The transcript reads what you say back to it.** A model told something true about
its answer does something different from a model told something that is not true of it, which is why
the third rule above asks for particular words rather than any words.

Nothing is imported from outside these files except `zod`. `npm`-style commands are not available:
hit **Run checkpoints** to see where you are.

## If you finish early

- `maxRepairs` and `maxWaits` are separate ceilings on the same request. Work out what you would want
  paged on, and whether a decision that took four attempts should reach the queue at all or should
  reach a person.
- The repair sends the whole conversation back, so a long wrong answer is paid for on every attempt
  after it. Decide whether you would leave it in and what you would lose by taking it out.
- Nothing here writes the decision anywhere. Work out where the retry would have to move to if
  `decide` filed the ticket itself, and which of the two ceilings would then be the dangerous one.
