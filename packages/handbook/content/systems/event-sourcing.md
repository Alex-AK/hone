---
title: Event sourcing
question: The row says the balance is 40. What I need to know is how it got there.
order: 17
practise:
  - sys-event-fold
  - sys-event-schema-change
  - sys-log-vs-queue-replay
  - sys-idempotency
  - approval-log-sqlite
sources:
  - author: Martin Fowler
    title: Event Sourcing
    url: https://martinfowler.com/eaaDev/EventSourcing.html
  - author: Apache Kafka
    title: Design
    url: https://github.com/apache/kafka/blob/trunk/docs/design/design.md
  - author: PostgreSQL
    title: 'Data Definition: Constraints'
    url: https://www.postgresql.org/docs/current/ddl-constraints.html
verified: 2026-08-08
---

Numbers here were measured against PostgreSQL 17.10 on a 300,000-event log.

## The model

An ordinary table stores where you ended up. Event sourcing stores how you got there, and computes
where you ended up on demand. Fowler's framing is that every change is captured "in an event object",
in sequence, so that the log of events is the record and the current state is derived from it.

The inversion is the whole idea: **the events are the source of truth and the table is a cache.** A
balance row is not data any more, it is the answer to a question, and the question is a fold:

```
state = events.reduce(apply, empty)
```

Three things you get, and it is worth being clear that they are the reason to do it, because the
costs below are real:

**Auditing stops being a feature you build.** "Who changed this and when" is not answerable from a
mutable row: the previous value is gone, overwritten by the thing you are looking at. A separate audit
table is the usual answer and it is a second write that can drift from the first, which makes it
[a dual write](./two-systems-one-write.md). With an event log there is nothing to keep in sync,
because the audit trail is not a copy of the history, it _is_ the history.

**You can ask questions you had not thought of yet.** A projection is just a different fold over the
same events, so a metric nobody specified last year can be computed over last year, which no amount of
schema design gets you from a table of current values.

**Debugging becomes reproducible.** The state that produced a bug is a prefix of the log, and you can
rebuild exactly it.

Three words that get used interchangeably and should not be:

- **Event sourcing** is a persistence decision: the log is the truth, state is derived.
- **Event streaming** is a transport decision: services communicate over
  [a log rather than a queue](./the-log-is-not-a-queue.md). You can do either without the other.
- **[CQRS](./cqrs.md)** is a modelling decision: the write side and the read side are different
  models. It pairs naturally with event sourcing, because a fold is a bad way to serve a list
  endpoint, but it is not the same claim and it does not require events.

## Worked example

```sql
CREATE TABLE event (
  "offset"    bigserial PRIMARY KEY,
  key         text        NOT NULL,     -- the aggregate: 'acct-42'
  type        text        NOT NULL,     -- 'money.deposited'
  version     int         NOT NULL,     -- the shape of `data`, not the aggregate's position
  data        jsonb       NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_key_offset_idx ON event (key, "offset");
```

The fold is the application, and it is ordinary code:

```ts
const apply = (state: Account, e: Event): Account => {
  switch (e.type) {
    case 'money.deposited':
      return { ...state, cents: state.cents + e.data.cents };
    case 'money.withdrawn':
      return { ...state, cents: state.cents - e.data.cents };
    case 'account.frozen':
      return { ...state, frozen: true };
    default:
      return state; // an event this version does not know about must not throw
  }
};

const load = (events: Event[]) => events.reduce(apply, { cents: 0, frozen: false });
```

Nothing here updates anything. A withdrawal is not `UPDATE accounts SET cents = cents - 500`; it is a
decision made against the folded state, followed by an append. That is also where the concurrency
control goes, and a unique constraint is enough: give the aggregate its own sequence number, make
`(key, sequence)` unique, and two concurrent commands racing to append number 51 produce a constraint
violation on one of them rather than a lost update.

## Traps

**We added snapshots and the rebuild got slower.** A snapshot is a cached fold, `{ key, state,
as_of_offset }`, and reloading means reading it plus the events after it. Measured both ways:

```
rebuild every account's balance from offset 0     15.3 ms
the same, from snapshots plus the tail            23.4 ms     <- slower

load ONE account with 100,000 events in its stream
  by folding the whole stream                     10.4 ms
  from a snapshot plus the 1,000 events since      0.58 ms    <- 18x
```

Both numbers are real and they point in opposite directions, which is the lesson. A full projection
rebuild is a sequential scan and a fold, and it is already about as fast as reading the data;
interposing a snapshot table adds a join and makes it worse. What a snapshot fixes is **one aggregate
with a long stream**, loaded on the hot path of a command. So the trigger for adding them is a stream
length, not a log size, and the question to ask is which aggregates get thousands of events rather
than how many events there are altogether.

**A deploy broke the fold on events from two years ago.** The log outlives every version of the code
that reads it, so the shape you wrote in 2024 is still there and still has to be understood. Two rules
make this survivable. Events are versioned in the row, not guessed at from their contents, which is
what the `version` column is for. And the reader upgrades old shapes on read, an upcast from v1 to v2
at the edge of the fold, so `apply` only ever sees the current shape and does not accumulate a branch
per historical mistake. What you must not do is rewrite old events to the new shape: that is a
migration of the audit trail, which destroys the one property you took all this on to get.

**Erasure met an append-only log.** Somebody asks for their personal data to be deleted and the design
says nothing is ever deleted. This is a real conflict rather than a trick question, and it is the
reason event sourcing is a bad default for a system full of personal data. The standard answer is to
keep the personal fields out of the events entirely, referenced by an id, or encrypted per subject
with the key held elsewhere so that destroying the key makes those events unreadable while the log
stays structurally intact. Decide this before the first event is written, because retrofitting it
means rewriting history, which is the operation the whole design exists to prevent.
