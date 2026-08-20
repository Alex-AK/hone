# The outbox again, one stream per order

The relay in `src/lib/relay.ts` is the one from "The orders fulfilment never heard about", in
production and doing what it was built to do: every committed outbox row reaches the broker, nothing
is marked published that the broker did not take, and the database is free while a publish is in
flight. That is where you are starting from, and none of it is what changed.

What changed is what fulfilment asks of it. An order now goes through more than one event:
`order.placed` when it is written, then `order.paid` or `order.cancelled` as things happen, all
through the same outbox. Fulfilment was rebuilt around the order, so it needs one order's events in
the order they were written and has no opinion about where another order's events sit relative to
them.

Two things came in this week.

**Fulfilment stopped for six hours on Tuesday.** One `order.cancelled` carried a payload the broker
refuses. Nothing was fulfilled from the moment that row was written until somebody deleted it by
hand, including 900 orders that had nothing to do with it, and every one of those went through as
soon as it was gone.

**The morning backlog takes most of an hour to clear.** The broker moved region in April and a
publish is now a round trip across it.

## What you are changing

`src/lib/relay.ts`, and nothing else. `Relay.runOnce()` still takes one pass over the unpublished
rows and returns what it did.

## What has to be true when you are done

- **An order's own events reach the broker in id order**, each one going out only after the one
  before it has landed.
- **Different orders go at the same time.** A pass holding three orders has more than one publish in
  flight.
- **An order the broker refuses holds up that order and nothing else.** Its unsent rows keep their
  place, so the next pass starts on them again.
- **A pass returns `{ published, blocked }`**: how many messages reached the broker, and how many
  orders it stopped on.

## What has to stay true

- A row is marked published only once the broker has taken it.
- Nothing is held on the database while a publish is in flight.
- `batchSize` is a limit on one pass, not a target. A pass that finds fewer rows sends fewer.
- No new tables, no new columns.

## About the environment

- **Every payload carries `orderId`, and that is the order the message belongs to.** Nothing else in
  the row says so.
- `src/lib/db.ts` is better-sqlite3 and **every call on it is synchronous**. There is no `await` on a
  query, and a transaction opened with `db.exec('BEGIN')` stays open until something commits it.
- `src/lib/broker.ts` is a fake with the awkward parts kept. `publish` is asynchronous and settles on
  a later turn of the event loop, and it **accepts duplicates without complaint**: the same
  `messageId` twice is recorded twice.
- Only `order.placed` has a writer in this workspace. The rest of the service writes the later events
  into the same outbox, and the checkpoints write them the same way.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- Nothing caps how many orders publish at once, so a batch of 500 orders opens 500 publishes. Decide
  where the cap belongs and what the right number is a function of.
- An order the broker will never accept takes its rows out of every batch from now on, and it is
  first in `id` order every time. Work out what that costs a backlog, and what a dead-letter table
  would have to record to be worth the column.
- Two relays running at once would both read the same unpublished rows and both send them. Work out
  what would have to change for a second one to be safe, and whether it can be done without holding
  anything on the database across a publish.
