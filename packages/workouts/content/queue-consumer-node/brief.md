# Build the queue consumer

Uploaded documents are converted in the background, off a queue. The queue redelivers: hand it a job,
say nothing back, and it hands the same job out again, to you or to whoever is free. Write the worker
on the other end of it.

## The task

One file: **`src/lib/consumer.ts`**. It is constructed as
`new Consumer(queue, handler, { maxReceiveCount, heartbeatMs }, clock)`, and `runOnce()` takes one
job, sees it through, and answers what happened. The checkpoints assert on all four answers:

- **`idle`** — nothing was visible. The handler is not called.
- **`handled`** — the handler finished, and the job is off the queue.
- **`failed`** — the handler threw. The job is still the queue's, and it comes back when its
  visibility timeout expires.
- **`dead-lettered`** — the handler threw on the job's `maxReceiveCount`th delivery. It goes to the
  dead-letter store carrying the error's message as its reason, and it is never delivered again.

Three things have to hold whatever the handler does.

**A job leaves the queue only once it is done.** Until then the queue still has it, and a worker that
stops halfway must not have cost anybody the job.

**A slow job stays yours.** A handler is allowed to run for longer than `queue.visibilityTimeoutMs`,
and no second worker gets a job that is still being worked on, however long it takes.

**A job that will never succeed cannot circulate forever.** `maxReceiveCount` is how many deliveries
it gets. A job that works on its last one is not a failure.

## What you are given

**`src/lib/queue.ts`** is the queue, in one file, with the awkward parts kept:

- `receive()` hides a job for `visibilityTimeoutMs` rather than removing it, and answers `undefined`
  when nothing is visible. What comes back is `{ id, receipt, body, receiveCount }`. `id` is the job
  and never changes, `receipt` is this delivery, and `receiveCount` is 1 the first time.
- `ack(receipt)` takes the job off the queue. `extend(receipt, ms)` moves its deadline to `ms` from
  now. `deadLetter(receipt, reason)` moves it to the dead-letter store, which `deadLetters()` reads.
- **A receipt is good only for the delivery it came with.** Once that delivery has been superseded,
  all three of those do nothing at all, and say nothing about it.
- When the deadline passes and the queue has heard nothing, the job is back in the queue with
  `receiveCount` one higher. The queue does not care why it heard nothing, and it will do this
  forever: nothing in here dead-letters on its own.
- `failNextAck()`, `depth()` and `inFlight()` are test-only. You do not need them.

**`src/lib/clock.ts`** is a clock the checkpoints drive. `now()` reads it, `sleep(ms)` resolves once
the clock has moved that far, and nothing moves it except a checkpoint calling `advance()`. The queue
reads its deadlines from it, so use it for anything that has to happen while a handler is running: a
real `setTimeout` waits in real time, which the checkpoints do not.

## The last checkpoint

The first four run one worker over jobs somebody wrote, on one visibility timeout, one heartbeat and
one `maxReceiveCount`. The last one generates the backlog: the three options, how many documents are
waiting, what the handler does on each delivery, and which ack dies on the way. Two things about
those backlogs are worth knowing. A job can be given a single delivery, so the delivery whose ack
dies is sometimes also the last one that job had. And a slow handler is watched while it is running
rather than only after it, so "no second worker gets a job that is still being worked on" is read at
every step the handler wakes on.

It adds no rules. Everything it checks is on this page already. When it fails it leads with the rule
that broke and then prints the shortest backlog that still breaks it, which is a complete
reproduction: those options, that many documents, those deliveries, in that order.

## Notes

One checkpoint stands in for the worker dying between the work and the ack by making `ack` throw.
Whether you let that escape `runOnce` is up to you. What is asserted is what it leaves behind.

Nothing is imported from outside these three files, and nothing needs to be. `npm`-style commands are
not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- A second delivery of a job that already ran is the price you just agreed to pay. Making that cost
  nothing is separate work, and `idempotent-payments-express` is it at the HTTP boundary: the claim
  goes in with the effect, and a unique index settles who won.
- `runOnce` holds one job at a time. Work out which of the three rules above still holds when ten
  workers are pulling from this queue, and which one only ever held because there was one of you.
- A dead-letter store nobody reads is a place work goes to be forgotten. Decide what you would alarm
  on, and what you would need in the record to be able to put a job back.
