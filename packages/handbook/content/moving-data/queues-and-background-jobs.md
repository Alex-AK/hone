---
title: Queues and background jobs
question: This work does not have to happen inside the request. What changes the moment I put it on a queue?
order: 13
practise:
  - sys-queued-work-invisible
  - sys-message-delivery-semantics
  - sys-idempotency
  - http-idempotency-key
  - code-promise-pool
  - queue-consumer-node
sources:
  - author: Amazon Web Services
    title: Amazon SQS standard queues
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html
  - author: Amazon Web Services
    title: Amazon SQS visibility timeout
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html
  - author: Amazon Web Services
    title: Using dead-letter queues in Amazon SQS
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
  - author: Amazon Web Services
    title: Exactly-once processing in Amazon SQS
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html
verified: 2026-08-01
---

## The model

A queue is not a transport. It is a place a message waits, and that is the one property nothing else
in this section has: send a message while nobody is listening and it is still there later. Every
other trade on this page follows from it.

**Who starts it.** A producer, usually the same request handler that would otherwise have done the
work itself. It writes a message and returns.

**How many messages.** One in and one out, in one direction, with an unbounded amount of time in
between. There is no reply. If the caller needs to know how it went, that is a separate mechanism: a
status the client polls, or a second queue going the other way.

**Delivery.** At least once, and you cannot buy your way out of it. AWS documents standard SQS as
at-least-once, with more than one copy possibly delivered and messages occasionally arriving out of
order. That is not the broker being careless. The network between it and your consumer can lose the
message, and it can lose the acknowledgement that the message was handled, and from the broker's
side those two look identical. It has to guess, and doing the work twice beats losing it.

**Cost.** A broker to run, a consumer to keep alive, and a new place for things to go wrong where
nobody is looking. A queue turns a request that fails loudly in front of a user into work that fails
quietly at 3am.

The mechanics are the same whatever the broker is called. A consumer receives a message and the
broker hides it from other consumers for a **visibility timeout**, which SQS defaults to 30 seconds,
rather than deleting it. Delete the message before that expires and it is gone. Fail to, because the
process crashed or the work ran long or the delete call itself failed, and the message becomes
visible again for somebody to pick up a second time. A **dead-letter queue** catches the message
that keeps coming back: SQS's redrive policy sets a `maxReceiveCount`, and a message received that
many times without being deleted moves to the DLQ instead of circulating forever.

Which brings up exactly-once, because it is on the box. SQS FIFO queues advertise exactly-once
processing, and what AWS documents is narrower than what people read: retry `SendMessage` inside the
five-minute deduplication interval with the same deduplication ID and no duplicate enters the queue.
That is producer-side deduplication, it is genuinely useful, and it says nothing about a consumer
that charged a card and then died before deleting the message. No broker can, because whether the
work happened is a fact in your database rather than theirs. Exactly-once is at-least-once delivery
plus a consumer for which a repeat is a no-op, and the second half is yours to write.

## Worked example

The effect and the record that it happened commit together, or neither does:

```js
async function handle(message) {
  const { messageId, orderId } = JSON.parse(message.Body);

  const firstTime = db.transaction(() => {
    const claim = db.prepare('INSERT OR IGNORE INTO handled (id) VALUES (?)').run(messageId);
    if (claim.changes === 0) return false;
    db.prepare("UPDATE orders SET status = 'shipped' WHERE id = ?").run(orderId);
    return true;
  })();

  if (firstTime) {
    await mailer.send(shippingEmail(orderId), { idempotencyKey: messageId });
  }

  await sqs.deleteMessage({ QueueUrl, ReceiptHandle: message.ReceiptHandle });
}
```

The claim and the update are one transaction, so a crash between them cannot leave a message marked
as handled that was not. The email is outside it and has to be, because an email cannot be rolled
back: for anything beyond your own database the only defence is an idempotency key at the far end,
which is why every payment and mail API offers one.

There is still a gap, and it is worth naming rather than hiding. If the process dies after the
commit and before the send, the redelivery sees the claim and skips the email, so that message is
lost. Sending before the commit trades it for a possible duplicate. Pick per message type, according
to which of the two you would rather explain. That choice is forced here because an email cannot be
unsent; where the far side is a system you own, there is a third answer that removes the gap instead
of choosing a side of it, and it is [two systems, one write](../systems/two-systems-one-write.md).

## Traps

**The customer got three confirmation emails.** Nothing failed. The consumer did the work and the
acknowledgement never landed, or it landed after the visibility timeout had already expired and a
second consumer had picked the message up. The queue behaved as documented. The fix is never on the
broker's side; it is a key the consumer records in the same transaction as the effect.

**A job runs twice, and the second copy starts while the first is still running.** The visibility
timeout is shorter than the work. SQS starts at 30 seconds, so a 90-second import gets a second
consumer at second 30 and both write the same rows. Raise the timeout to cover the slow case, or
extend it from inside the job with `ChangeMessageVisibility` as a heartbeat. Both are bounded: the
timeout maxes out at 12 hours from the first receive, and extending it does not reset that clock.

**The dead-letter queue is empty and the messages are gone.** For a standard queue the message keeps
its original enqueue timestamp when it moves, so retention is counted from when it was first sent
rather than from when it gave up. A message that spent a day failing in the source queue lands in a
DLQ with four days of retention and has three left. Set the DLQ's retention period longer than the
source queue's, which is AWS's own advice for exactly this reason.

**Everything is on the queue and the user cannot tell.** The request returned in eight milliseconds
and the work is somewhere else now. The moment the queue backs up or a consumer starts throwing, the
UI keeps saying the same cheerful thing it said when everything was fine. Moving a failure out of
the request does not remove it. Whatever you enqueue needs a state the user can see and an alarm on
the dead-letter queue, or you have built something that loses work silently.
