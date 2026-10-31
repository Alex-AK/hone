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

A queue holds work for another process to pick up later. The system in the middle cannot always
tell whether a piece of work was handled, so it either risks losing it or risks handing it out
twice. Most choose twice, which means the code doing the work has to be safe to run more than once.

## The model

A broker can risk losing a message or risk delivering it twice, never neither, so an exactly-once
result is something your consumer builds on top of at-least-once delivery.

Kafka's design docs name the three semantics:

- **At most once** — messages can be lost but are never redelivered. The consumer acknowledges on
  arrival, before doing anything. Crash a moment later and the message is gone for good. Correct for
  a metrics sample, wrong for an order.
- **At least once** — messages are never lost but can be redelivered. The consumer acknowledges
  after the work. Crash before that and the broker hands the message to somebody else.
- **Exactly once** — the one everybody wants, and not something a network hands you.

The reason is the broker's position: a lost message and a lost acknowledgement look identical from
where it stands. It sent something and heard nothing back, so it picks a risk. Assume the message
arrived and you get at-most-once, with silent loss; assume it did not and you get at-least-once,
with duplicates. Kafka is at-least-once by default; you get at-most-once by committing offsets
before processing. Tyler Treat traces the impossibility to the Two Generals problem and says the
industry fakes it, with idempotent messages or deduplication.

Exactly-once _delivery_ is off the table. An exactly-once _effect_ is not: it is at-least-once
delivery plus a consumer for which a repeat is a no-op. That second half has to be application code,
because whether the work happened is a fact in your database, not the broker's. That is
`sys-idempotency` and `sys-message-delivery-semantics`. The same argument at the HTTP boundary is
[idempotency](../apis/idempotency.md).

At-least-once brings four mechanics, the same whatever the broker is called.

**Acknowledge after the work, not on receipt.** The acknowledgement says this is done, and only
having done it makes that true. RabbitMQ says automatic acknowledgement mode "should be considered
unsafe". In Kafka the same decision is where you commit the offset; in SQS, where you call
`DeleteMessage`.

**The redelivery window.** Between delivery and acknowledgement the message is neither gone nor
available to anyone else. SQS hides it for a **visibility timeout**, 30 seconds by default, after
which an undeleted message becomes visible to other consumers again. RabbitMQ requeues an unacked
delivery when its channel or connection closes. Kafka has no per-message lock: the consumer owns the
partition, so redelivery means a rebalance and a new consumer reading from the last committed
offset.

**A slow consumer gets its own message back.** The window is a bet on how long the work takes, and
losing it does not look like a retry. The broker decided you were dead while you were still working,
so the second copy runs _concurrently_ with the first, and a deduplication check that reads before
the first copy commits finds nothing to skip. Size the window for the slow case or extend it from
inside the job as a heartbeat. In SQS the visibility timeout tops out at 12 hours from the first
receive, however often you extend it. AWS also notes that a standard queue can deliver a message
twice even inside the window, so the window narrows the odds without closing them.

**Dead-letter queues.** A message that fails every time is redelivered every time, forever. A DLQ is
the off-ramp: SQS's redrive policy sets a `maxReceiveCount`, and a message received that many times
without being deleted moves to the dead-letter queue. It is not a fix, and nobody watches it by
default, so alarm on its depth the day you create it.

**Ordering is per partition or per key, never global.** Kafka's guarantee is that "any consumer of a
given topic-partition will always read that partition's events in exactly the same order as they
were written", and a message's key decides its partition. SQS FIFO scopes ordering to a message
group. Either way, global ordering and parallel consumers are the same trade, and the key is where
you make it. Key by the entity whose order matters, the order id or the account, and unrelated
entities keep flowing in parallel.

Whether to use a queue at all is [queues and background
jobs](../moving-data/queues-and-background-jobs.md). Doing the work in-process instead is
[background work](../server-runtime/background-work.md).

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

In the third lane nothing failed and nobody retried; the work outlasted the window. Either the
window covers the slow case, or the job extends it while it runs:

```js
// Tell the broker you are alive, before it decides otherwise.
const heartbeat = setInterval(
  () => sqs.changeMessageVisibility({ QueueUrl, ReceiptHandle, VisibilityTimeout: 60 }),
  20_000
);
```

## Traps

**The broker advertises exactly-once and the customer was charged twice.** The claim is narrower
than the words: producer-side deduplication of a resend inside a time window, or a transaction
within that one system. Neither covers a consumer that charged a card through somebody else's API
and died before acknowledging. Assume the consumer's half is yours.

**The acknowledgement is in a `finally` block.** It acknowledges failures as reliably as successes,
so a bug that throws on every message empties the queue in minutes with nothing done and nothing in
the dead-letter queue. Acknowledge on the success path only; leaving a failed message untouched is
what makes redelivery and the DLQ work.

**A job runs twice and the second copy starts while the first is still going.** The work outlived
the redelivery window. Two copies are live at once, so a check that reads a processed-ids table
first sees nothing, both proceed, and both write. Claim the work with an insert the database
arbitrates, in the same transaction as the effect, rather than reading first and deciding second.

**Everything was in order in staging and out of order in production.** Staging ran one consumer and
production runs six. Order holds only within a partition or message group, so two related messages
with different keys are processed in parallel, in whatever order the schedulers decide. Pick a key
that puts everything which must stay ordered in one place, and accept that this caps your
parallelism at the number of distinct keys.
