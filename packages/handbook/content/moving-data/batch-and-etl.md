---
title: Batch and ETL
question: They asked for realtime. Is a job that runs on a schedule the honest answer?
order: 14
practise:
  - sys-half-open-window
  - sql-dedupe-keep-latest
  - sys-idempotency
  - sys-back-of-envelope
  - slow-list-endpoint-kysely
sources:
  - author: Apache Airflow
    title: DAG Runs
    url: https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html
  - author: Apache Beam
    title: Basics of the Beam model
    url: https://beam.apache.org/documentation/basics/
  - author: dbt Labs
    title: Incremental models
    url: https://docs.getdbt.com/docs/build/incremental-models
  - author: SQLite
    title: UPSERT
    url: https://www.sqlite.org/lang_upsert.html
verified: 2026-08-01
---

Not every piece of data has to move the moment it changes. A scheduled job that wakes up, copies a
slice of data somewhere else and exits is often the honest answer to a request for realtime, because
nobody acts on the number any faster. The hard parts are rows that arrive after their slice was
already read, and making sure that running the job again does not count everything twice.

## The model

This is the fourth answer to "who starts it": a clock. Nothing is waiting for a response, because
there is no response. A job wakes up, reads a bounded set of rows, writes them somewhere else, and
exits.

That makes it a different axis rather than another point on the same one. Everything above optimises
the latency of one message. A batch job optimises throughput and the ability to be run again. One
query over a million rows costs a fraction of what a million messages cost, and what you pay for it
is freshness.

Which is why it is the honest answer to a lot of "we need realtime" requests. The question is not
how fast the data can move but what anyone does differently when it moves faster. A report someone
reads with their coffee does not need a stream. A finance dashboard reconciled against a system that
itself settles overnight cannot be fresher than overnight, whatever sits in front of it. A good
share of the time "realtime" means "the number was stale and nobody could tell", and a timestamp on
the page fixes that for one line of code.

The unit here is the window, not the message. Airflow calls it the data interval, and the
consequence that matters is in the scheduling: a run is scheduled after its interval has ended, so
that it can see all of the data in it. A daily run covering 2020-01-01 does not start until after
2020-01-02 00:00:00, and its logical date is the start of the interval rather than the moment it
ran. Most confusion about scheduled jobs unravels into that sentence.

The other half is that a window's data does not all arrive inside the window. Beam names the guess:
a watermark is when all the data in a window is expected to have arrived, and an element that turns
up with a timestamp inside a window the watermark has already passed is late data. Batch meets the
same thing with less ceremony. A row commits at 00:00:02 carrying a `created_at` of 23:59:58, the
run for the previous hour has already read the table, and no window-bounded query will ever look at
that row again.

So a batch job needs two properties: a lookback wider than the lateness it actually sees, and a
rerun that changes nothing when the inputs have not changed.

## Worked example

An incremental load written so that running it twice is the same as running it once:

```sql
-- Half-open window. :lookback_start is :window_start minus however late rows really arrive.
INSERT INTO orders_daily (order_id, day, total)
SELECT id, date(created_at), total
FROM orders_raw
WHERE updated_at >= :lookback_start
  AND updated_at < :window_end
ON CONFLICT (order_id) DO UPDATE
  SET day = excluded.day,
      total = excluded.total;
```

Three decisions in six lines. `>=` with `<` makes consecutive windows meet without overlapping, so a
row stamped at exactly midnight belongs to one day rather than two. The lookback pulls in rows that
landed after the previous run had read past them, which means deliberately reprocessing work already
done. And the upsert is what makes that reprocessing safe: `excluded` refers to the row that would
have been inserted, so a second pass rewrites the row to the same value instead of adding a copy.
dbt's `unique_key` does the same job for the same reason, replacing a matching row rather than
appending, and a model without one appends duplicates on every run.

## Traps

**Yesterday's total changes if you look again today.** Rows arrived after yesterday's window had
been read, and the next run's window starts after them, so they sit in the source table and in no
output at all. The symptom is a report that disagrees with the source system by a small amount that
never gets smaller. Measure how late your data actually is, then widen the lookback past it and
reprocess.

**Rerunning the job doubles every number.** An append where an upsert was needed. The test for this
is cheap and almost nobody runs it: execute the job twice over the same window and diff the output.
If the two differ, the job cannot be rerun, and you will need to rerun it, because the day it dies
halfway through is not the day to discover that.

**A row is in two windows, or in none.** `BETWEEN` on a timestamp is inclusive at both ends, so
consecutive windows written with it overlap by one instant and a row on the boundary is counted
twice. Nudging the bound by a second to fix that is how rows go missing instead. Half-open
intervals, everywhere.

**Unpausing the scheduler takes the warehouse down.** Airflow's catchup starts a run for every data
interval that has not run since the last one, so a job paused for a week comes back as dozens of
runs at once, each written on the assumption that it is alone, all hitting the database the
application is also using. Cap the concurrency before you unpause, or backfill on purpose rather
than by flipping the switch back.
