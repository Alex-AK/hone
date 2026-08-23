# The orders fulfilment never heard about

Orders are written to `orders` and an `order.placed` row goes into `outbox` in the same transaction.
A relay process moves those rows to the broker, and fulfilment works off the broker.

Two things came in this week.

**Support has four orders from the last month that were paid for and never shipped.** Nobody can find
anything wrong with them. The order rows are there, the outbox rows are there, and each one has a
`published_at` timestamp from about the time the order was placed. Fulfilment has no record of any of
the four.

**The platform team asked us to stop doing whatever we do at 09:00.** Their graph shows writes from
the API queueing up for seconds at a time, every morning, in a window that lines up with the relay
working through the overnight backlog. It got worse after the broker was moved to another region.

## What you are changing

`src/lib/relay.ts`, and nothing else. `Relay.runOnce()` takes one pass over the unpublished rows and
returns what it did.

## What has to stay true

- **The writer stays as it is.** `placeOrder` in `src/lib/db.ts` already commits the order and its
  outbox row together, and that half is not the problem.
- **Rows go to the broker in `id` order.** Consumers depend on it.
- **`batchSize` is a limit on one pass**, not a target. A pass that finds fewer rows sends fewer.
- **No new tables, no new columns.** `published_at` is the only state the relay keeps.

## The last checkpoint

The first four place every order before the first pass and break the write that records a publish
exactly once, at the start of a one-row backlog. The last one generates the backlog: the batch size,
how many orders there are, when they arrive, which rows the broker is refusing, and where in a batch
the recording write dies. Two things about those are worth knowing. Orders turn up between passes as
well as before them. And a batch of five whose third mark dies is the case the other four never
reach, which is what `failNextWrite`'s second argument is for.

It adds no rules. Everything it checks is on this page already. When it fails it leads with the rule
that broke and then prints the shortest backlog that still breaks it, which is a complete
reproduction: that batch size, those orders, those passes, in that order.

## About the environment

- `src/lib/db.ts` is better-sqlite3 and **every call on it is synchronous**. There is no `await` on a
  query, and a transaction opened with `db.exec('BEGIN')` stays open until something commits it.
- `src/lib/broker.ts` is a fake with the awkward parts kept. `publish` is asynchronous and settles on
  a later turn of the event loop, and it **accepts duplicates without complaint**: the same
  `messageId` twice is recorded twice. That is the real behaviour, not a gap in the fake.
- Both are given to you. The checkpoints drive them directly, so you do not need to change either.
