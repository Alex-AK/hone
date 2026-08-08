---
title: Queues and delivery semantics
question: The queue says at-least-once. What does that make my problem?
order: 13
practise:
  - sys-ack-after-work
  - sys-message-delivery-semantics
  - sys-idempotency
  - http-idempotency-key
sources:
  - author: Apache Kafka
    title: 'Design: message delivery semantics'
    url: https://github.com/apache/kafka/blob/trunk/docs/design/design.md
  - author: Apache Kafka
    title: Introduction
    url: https://kafka.apache.org/intro/
  - author: RabbitMQ
    title: Consumer acknowledgements and publisher confirms
    url: https://www.rabbitmq.com/docs/confirms
  - author: Amazon Web Services
    title: Amazon SQS visibility timeout
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html
  - author: Amazon Web Services
    title: Using dead-letter queues in Amazon SQS
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
  - author: Amazon Web Services
    title: Using the message group ID with Amazon SQS FIFO queues
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagegroupid-property.html
  - author: Tyler Treat
    title: You cannot have exactly-once delivery
    url: https://bravenewgeek.com/you-cannot-have-exactly-once-delivery/
verified: 2026-08-01
---

## The model

Three semantics, and Kafka's design docs put them in the fewest words anyone has managed:

- **At most once** — "Messages may be lost but are never redelivered." The consumer acknowledges when
  the message arrives, before doing anything with it. Crash a moment later and the message is gone
  and nothing will bring it back. Correct for a metrics sample, wrong for an order.
- **At least once** — "Messages are never lost but may be redelivered." The consumer acknowledges
  after the work is done. Crash before that and the broker hands the message to somebody else.
  Duplicates are possible, drops are not.
- **Exactly once** — the one everybody wants, and not something a network hands you.

The reason is one fact about the broker's position: a lost message and a lost acknowledgement look
identical from where it is standing. It sent something and heard nothing back, and no amount of
engineering inside the broker tells those two apart. So it picks which risk to take. Assume the
message arrived and you get at-most-once, with silent loss. Assume it did not and you get
at-least-once, with duplicates. Kafka guarantees at-least-once by default and documents at-most-once
as the thing you switch on deliberately, by committing offsets before processing rather than after.
Tyler Treat traces the impossibility back to the Two Generals problem and describes the industry's
answer as faking it: the messages are made idempotent, or duplicates are removed by deduplication.

Which is the whole point of this page. Exactly-once _delivery_ is off the table. An exactly-once
_effect_ is not, and it is at-least-once delivery plus a consumer for which a repeat is a no-op. The
second half is application code, and it cannot be anything else, because whether the work happened is
a fact in your database rather than the broker's. That is `sys-idempotency` and
`sys-message-delivery-semantics`. The same argument at the HTTP boundary, with keys and a claim
settled by a unique index, is [idempotency](../apis/idempotency.md).

Four mechanics follow from at-least-once, and they are the same four whatever the broker is called.

**Acknowledge after the work, not on receipt.** The acknowledgement is the consumer saying this is
done, and the only thing that makes that true is having done it. RabbitMQ is blunt about the
alternative: automatic acknowledgement mode "should be considered unsafe". The same decision is where
you commit the offset in Kafka and where you call `DeleteMessage` in SQS.

**The redelivery window.** Between delivery and acknowledgement the message is neither gone nor
available to anyone else, and every broker names that gap differently. SQS hides it for a **visibility
timeout**, 30 seconds by default, and if you have not deleted it by then the message "becomes visible
again in the queue and can be retrieved by another consumer". RabbitMQ requeues any delivery that was
not acked when the channel or connection it arrived on closes. Kafka has no per-message lock at all:
the consumer owns the partition and its position is an offset, so redelivery there means a rebalance
and a new consumer reading from the last committed offset.

**A slow consumer gets its own message back.** The window is a bet on how long the work takes, and
losing the bet does not look like a retry. The broker concluded you were dead while you were still
working, so the second copy runs _concurrently_ with the first, and a deduplication check that reads
before the first copy has committed anything finds nothing to skip. Size the window for the slow case
or extend it from inside the job as a heartbeat. In SQS both are bounded: the visibility timeout maxes
out at 12 hours from the first receive, and extending it does not reset that clock. AWS also notes
that even inside the window a standard queue does not guarantee a message will not be delivered more
than once, so the window narrows the odds rather than closing them.

**Dead-letter queues.** A message that fails every time is redelivered every time, forever, and it
occupies a consumer each go round. A DLQ is the off-ramp: SQS's redrive policy sets a
`maxReceiveCount`, and a message received that many times without being deleted moves to the
dead-letter queue instead of back onto the source queue. Two things it is not. It is not a fix, and it
is not watched by default, so alarm on its depth the day you create it or you have built a place where
work goes to be forgotten.

**Ordering is per partition or per key, never global.** Kafka's guarantee is that "any consumer of a
given topic-partition will always read that partition's events in exactly the same order as they were
written", and which partition a message lands in is decided by its key. SQS FIFO scopes it to a
message group, where "messages within the same message group are always processed one at a time, in
strict order". The consequence is identical in both: global ordering and parallel consumers are the
same trade, and the key is where you make it. Key by the entity whose order actually matters, the
order id or the account, and unrelated entities keep flowing in parallel.

Whether to reach for a queue at all, and what the consumer's transaction looks like once you have,
are [queues and background jobs](../moving-data/queues-and-background-jobs.md). Doing the work
in-process instead is [background work](../server-runtime/background-work.md).

## Worked example

One message, one consumer, and where the acknowledgement goes. The visibility timeout is 30 seconds
and the work takes 45.

```
acknowledge on receipt
  00:00  receive              the broker considers it handled
  00:00  delete
  00:03  the process crashes  the charge never happened and nothing will retry it

acknowledge after the work, and the work fits the window
  00:00  receive              hidden from other consumers until 00:30
  00:20  the work commits
  00:20  delete               handled exactly once, this time

acknowledge after the work, and the work does not fit the window
  00:00  consumer A receives  hidden until 00:30
  00:30  the timeout expires  A is still working, and nothing told it so
  00:31  consumer B receives  the same message, a second copy running concurrently
  00:45  A commits and deletes
  00:52  B commits            two charges, unless the commit itself was the deduplication
```

The third lane is the one worth staring at. Nothing failed, nobody retried, and the message was
processed twice because 45 is larger than 30. Either the window covers the slow case, or the job
extends it while it runs:

```js
// Tell the broker you are alive, before it decides otherwise.
const heartbeat = setInterval(
  () => sqs.changeMessageVisibility({ QueueUrl, ReceiptHandle, VisibilityTimeout: 60 }),
  20_000
);
```

## Traps

**The broker advertises exactly-once and the customer was charged twice.** The claim on the box is
narrower than the words: producer-side deduplication of a resend inside a time window, or a
transaction that spans reading and writing within that one system. Neither covers a consumer that
charged a card through somebody else's API and died before acknowledging. Read what the guarantee is
scoped to, and assume the consumer's half is yours.

**The acknowledgement is in a `finally` block.** It acknowledges the failures as reliably as the
successes, so a bug that throws on every message empties the queue in minutes with nothing done and
nothing in the dead-letter queue. Acknowledge on the success path only. Leaving the message untouched
on the failure path is what makes the redelivery window and the DLQ work at all.

**A job runs twice and the second copy starts while the first is still going.** The work outlived the
redelivery window. This is not the retry-after-failure case and it does not behave like it: two
copies are live at once, so a check that reads a processed-ids table before doing the work sees
nothing, both proceed, and both write. Claim the work with an insert the database arbitrates, in the
same transaction as the effect, rather than reading first and deciding second.

**Everything was in order in staging and out of order in production.** Staging ran one consumer and
production runs six. Order is a per-partition or per-message-group guarantee, so the moment two
related messages get different keys they land in different partitions and are processed in parallel,
and the order becomes whatever the schedulers decide. Pick a key that puts everything which must stay
ordered in one place, and accept that this caps your parallelism at the number of distinct keys.
