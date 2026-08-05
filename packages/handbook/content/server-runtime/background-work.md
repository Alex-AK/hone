---
title: Background work
question: This endpoint takes nine seconds. What actually changes if I stop making the caller wait?
order: 8
practise:
  - debug-fire-and-forget-work
  - http-idempotency-key
  - debug-async-foreach
  - code-promise-pool
  - js-allsettled
sources:
  - author: MDN
    title: 202 Accepted
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/202
  - author: Amazon Web Services
    title: Amazon SQS standard queues
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html
  - author: Amazon Web Services
    title: Using dead-letter queues in Amazon SQS
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
  - author: IETF
    title: The Idempotency-Key HTTP Header Field
    url: https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header
verified: 2026-08-01
---

## The model

Work leaves the request when the caller does not need the result in order to carry on. Sending the
email, building the export, resizing the upload: the user wants to know it was accepted, and the
rest is your problem, not theirs. Keeping them on the line costs a held connection, a timeout that
will fire anyway, and a retry that does the expensive thing a second time.

HTTP has a status for the handover. 202 "indicates that a request has been accepted for processing,
but processing has not been completed or may not have started". It also comes with a warning worth
reading twice: a 202 "is non-committal, meaning there is no way to later send an asynchronous HTTP
response to indicate the outcome of the processing". Accepting work creates a debt. The caller now
needs some other way to learn what happened, which is a status URL they poll, an
[event stream](/handbook/moving-data/server-sent-events), or an email.

The other half is durability, and it is where "in the background" usually goes wrong. Work that
survives a deploy has to live somewhere outside the process: a row in a table, a message in a queue.
A promise you did not await is not background work, it is work that a restart deletes.

Moving to a queue changes three guarantees, and all three change your code:

- **Delivery is at-least-once.** SQS's standard queues "ensure at-least-once message delivery, but
  due to the highly distributed architecture, more than one copy of a message might be delivered".
  Your handler will run twice on the same job eventually. That is the same problem the idempotency
  key solves for HTTP, one layer down.
- **Order is best effort.** Messages "may occasionally arrive out of order". If two jobs for the
  same record must not cross, the ordering has to come from your data, not from the queue.
- **Failure is a counter, not a status code.** A message that keeps failing is redelivered until
  `maxReceiveCount` is reached and it moves to a dead-letter queue, which exists so you can "isolate
  unconsumed messages to determine why processing did not succeed". Without one, a single poisonous
  job retries forever and takes throughput with it.

Then the thing that surprises people: the job runs with no request around it. No headers, no
session, no guard. Everything the request layer proved has to travel in the payload or be proved
again by the worker.

## Worked example

Accepting the work, and doing it:

```js
app.post('/reports', async (req, res) => {
  const id = crypto.randomUUID();

  // The row first, so a message can never point at nothing.
  await db.insert(reports).values({ id, ownerId: req.user.id, status: 'queued', params });
  await queue.send({ reportId: id });

  res.status(202).location(`/reports/${id}`).json({ id, status: 'queued' });
});
```

```js
async function handleReportJob({ reportId }) {
  const report = await db.query.reports.findFirst({ where: eq(reports.id, reportId) });

  // Seen this one already, or its row is gone. Both are finished, not failed.
  if (!report || report.status === 'done') return;

  const file = await build(report.params);
  await db.update(reports).set({ status: 'done', file }).where(eq(reports.id, reportId));
}
```

Two details carry the example. The row is written before the message is sent, because the reverse
order hands a worker an id that does not exist yet. And the handler checks the state it owns before
doing anything, because it will be given the same message twice sooner or later, and the second time
should be cheap and harmless.

## Traps

**The job ran twice and the customer got two emails.** At-least-once delivery, working exactly as
documented. A handler that starts by reading its own state and returning early when the work is
already done costs one query and removes the whole class of bug. Where the side effect is somebody
else's system, send it a key so it can do the same.

**The response returned and the work quietly did not happen.** Fire-and-forget after `res.json()` is
a promise nobody is holding: a deploy takes it with it, a rejection becomes an unhandled rejection
in a log nobody reads, and it all works perfectly on your machine. If it matters, it goes in a
table before the response goes out.

**The queue is empty and the record says "queued" forever.** The message was published inside a
transaction that then rolled back, or published before the row was committed so the worker looked,
found nothing and treated that as success. Commit first, publish second, and make "no row" a retry
rather than a shrug.

**The worker can see records the request never could.** No guard runs on a job. If authorization was
the reason a user could only export their own report, the worker is now bypassing it with an id it
was handed. Put the owner in the payload and check it there, or have the job re-derive what the
guard proved.
