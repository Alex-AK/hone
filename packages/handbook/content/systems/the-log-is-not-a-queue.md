---
title: The log is not a queue
question: Both of them hold messages. Why does only one of them let me read last Tuesday again?
order: 16
practise:
  - sys-log-vs-queue-replay
  - sys-stuck-consumer-holds-the-log
  - sys-message-delivery-semantics
  - sys-ack-after-work
  - sys-idempotency
sources:
  - author: Apache Kafka
    title: Design
    url: https://github.com/apache/kafka/blob/trunk/docs/design/design.md
  - author: PostgreSQL
    title: 'Log-Shipping Standby Servers: Replication Slots'
    url: https://www.postgresql.org/docs/current/warm-standby.html
  - author: Amazon Web Services
    title: Amazon SQS standard queues
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html
verified: 2026-08-08
---

The measurements here were run against PostgreSQL 17.10, because a replication slot is a real log with
a real cursor and this repo can drive one. Kafka behaviour is quoted from its design documentation and
marked as such, never measured.

## The model

A queue holds work. A log holds history. Everything else follows from that one difference, and the
tell is what happens to a message after somebody reads it.

**In a queue the message is consumed.** It is delivered, acknowledged, and gone, because the queue's
job was to make sure the work happened once. Two consumers on one queue are two workers sharing a
pile, which is why adding consumers adds throughput. Ask a queue for last Tuesday and there is nothing
to ask: those messages did their job and left.

**In a log nothing is consumed.** The log is an append-only sequence, each record has an offset, and
reading is just moving your own cursor forward. The record does not care that you read it and neither
does anybody else's cursor. Two consumers on one log are two independent readers of the same history,
so adding a consumer adds a _use_ rather than throughput, and throughput comes from partitions
instead.

That is the whole of it, and the three things people actually want all fall out:

|                 | Queue                     | Log                             |
| --------------- | ------------------------- | ------------------------------- |
| After a read    | deleted on ack            | still there                     |
| Position        | the broker's, per message | yours, one offset               |
| Second consumer | shares the work           | reads it all, independently     |
| Read it again   | no                        | move your cursor back           |
| Bounded by      | how fast you consume      | retention: time, size, or a key |

**Retention is the property doing the work.** A queue empties because it is drained. A log empties
because it is old, which is a completely different promise: your history is there until a deadline
somebody configured, and then it is not, whether or not anyone read it. Kafka also offers the third
option, retention by key: log compaction "ensures that Kafka will always retain at least the last known
value for each message key within the log of data for a single topic partition", which turns the log
into something you can rebuild current state from without keeping every change ever made.

**"Message bus" is not a fourth thing.** It usually names the fan-out question, which is whether one
message goes to one consumer or to every subscriber, and both a queue and a log can answer it. A queue
does it with one queue per subscriber. A log does it by giving each subscriber its own cursor, which
is what a Kafka consumer group is. The decision worth making is not the vocabulary, it is whether you
will ever need to read the same message twice.

## Worked example

The shape of a log, with the cursors as ordinary rows:

```sql
CREATE TABLE event (                        -- append-only: no UPDATE, no DELETE
  "offset"    bigserial PRIMARY KEY,
  key         text        NOT NULL,         -- the partition key: which account
  type        text        NOT NULL,
  data        jsonb       NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consumer_offset (              -- one row per group. This is the whole difference.
  group_name text   PRIMARY KEY,
  position   bigint NOT NULL DEFAULT 0
);
```

Three groups over a 200,000-event log, measured:

```
ledger          at offset 200000,      0 events behind
fraud-scoring   at offset 148000,  52000 events behind
analytics       at offset      0, 200000 events behind

events still in the log after all that reading: 200000
```

Nothing any of them did removed anything. `analytics` was added this morning and gets the entire
history for free, which on a queue would have required somebody to have thought of `analytics` before
the messages were sent. Rewinding `fraud-scoring` to reprocess a week is `UPDATE consumer_offset SET
position = ...`, and that is the operation a queue has no equivalent for.

A consumer reads its own slice and advances only when the work is done, which is
[the same ack rule as everywhere else](./queues-and-delivery-semantics.md):

```sql
SELECT * FROM event WHERE "offset" > :position ORDER BY "offset" LIMIT 500;
-- ... handle them, idempotently, because this can run twice ...
UPDATE consumer_offset SET position = :last_offset WHERE group_name = :group;
```

## Traps

**The disk filled up and nobody was writing much.** A log retains until every consumer has moved past,
so one stopped consumer pins the whole log from its position forward, and the cost lands on the
broker rather than on the consumer that stopped. Postgres makes this measurable because a replication
slot is exactly that promise, "an automated way to ensure that the primary server does not remove WAL
segments until they have been received by all standbys". Measured: one slot created and then never
read from held **159 MB of WAL** generated by a single 400,000-row table build, and dropping the slot
released it at the next checkpoint. The operational lesson is not subtle: alarm on consumer lag, and
alarm on the oldest cursor rather than the average, because it is the worst one that decides your disk.

**We can always replay, so we did.** Replaying a log re-runs the reads and not the world. Every side
effect the consumer had the first time, every email, every charge, every webhook, happens again unless
the consumer is idempotent, and the reason replay looks safe is that the log itself is immutable while
the consumer is not. Before rewinding a cursor in production, work out what the handler does on a
second pass; if the answer is "sends the email again", the replay you want is into a fresh projection
with the side effects disabled, not through the live consumer.

**The event was there yesterday.** Retention is a deadline and not a guarantee of possession. A
consumer down longer than `retention.ms` comes back to a cursor pointing at data that no longer
exists, and what it does then is a configuration choice rather than an error you will see: it resets
to the earliest or the latest offset and either reprocesses a huge backlog or silently skips
everything it missed. Both are bad in different directions. Compaction does not save you here either,
because it promises the last value per key and not the history: as Kafka's own docs put it about plain
time retention, "the log is no longer a way to restore the current state", and compaction fixes that
one thing and not the ability to see what happened in between.
