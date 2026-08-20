# Nobody can try a chasing rule without the database

Changing a chasing rule costs an afternoon. Seeing what one does means getting the database into the
right state and the calendar into the right place, so last month's change to the payment-plan rule
went out on the strength of one run against one afternoon's data. A customer found what that run did
not.

Make the rules something you can hand values to. Nothing about what goes out changes.

## The task

Two files are yours. **`src/server/chase.ts`** holds the rules. **`src/server/run.ts`** assembles one
run and holds the per-customer cap.

**The run plans exactly what it planned.** Same invoices, same levels, same order, and the nightly
job records the same rows.

**Every rule still fires where it did.** A rule that goes quiet because nothing gathered what it
reads is the failure to watch for, and it fails no differently from a rule you deleted.

**Importing `chase.ts` pulls in nothing.** Not the store, not the clock.

**Nothing is fetched while the decision is being made.** No store call and no clock read may have
`chase.ts` anywhere on its stack. Handing the store in as an argument moves the import and not the
call.

## What you are given

**`src/server/store.ts` and `src/server/clock.ts` are the outside world**, and neither is yours to
edit. The store is `openInvoices()`, `customer(id)`, `remindersFor(invoiceId)`, `settings()` and
`recordReminder(...)`. The clock is `now()`, stopped at whatever instant the checkpoints choose.

**Every call into either is recorded with the files on its stack.** That is what the last checkpoint
reads, and it prints the calls it found `chase.ts` underneath.

**`src/server/nightly.ts` calls `chaseRun()`** and is not yours either, so that signature stays.

**`src/server/model.ts` is types and nothing else**, so importing it costs nothing at run time.

## Notes

No checkpoint counts queries. Whether the run fetches for every open invoice or works out first which
ones it is going to need is yours to decide, and it is not what is being checked.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- The cap needs nothing fetched, and it sits in `run.ts` because that is where it already was. Move
  it in with the rules and decide which side reads better.
- `now` comes off the clock and the quiet period comes out of the store. One of those is the world
  and one is configuration; decide whether that difference should show in how they arrive.
- Nothing tests the rules directly even now, which was the point of the afternoon. Sketch the test
  you could finally write for the day-21 boundary, and see how much of a database it wants.
