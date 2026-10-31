---
title: What an index costs
question: Should I add an index here, and what am I paying for the ones already on the table?
order: 1
practise:
  - sql-index-unused-cost
  - sql-index-order-desc
  - slow-list-endpoint-kysely
sources:
  - author: PostgreSQL
    title: Introduction to Indexes
    url: https://www.postgresql.org/docs/current/indexes-intro.html
  - author: PostgreSQL
    title: CREATE INDEX
    url: https://www.postgresql.org/docs/current/sql-createindex.html
  - author: PostgreSQL
    title: The Statistics Collector: Viewing Statistics
    url: https://www.postgresql.org/docs/current/monitoring-stats.html
  - author: PostgreSQL
    title: Unique Constraints
    url: https://www.postgresql.org/docs/current/ddl-constraints.html
verified: 2026-08-04
---

An index makes some reads faster, and it is paid for on every write and in disk space for as long as
it exists. The read gets faster every time, so the cost is easy to miss: it hides behind ordinary
requests and turns up when something writes in bulk, like an import. An index nothing uses still
charges you.

## The model

An index is a second copy of the columns it names, kept sorted, with a pointer back to the row. The
database keeps that copy correct for you, and that is the entire bargain: you buy a faster read with
a structure that has to be written, stored and maintained for as long as it exists. Nothing warns you
when it stops being worth it.

Every number here was measured on PGlite 0.5.4, which is PostgreSQL 18.3 compiled to wasm, so read
the ratios rather than the milliseconds. Three costs, and they are nowhere near the same size.

**Disk is the largest and the most predictable.** An index on a text column stores that text again,
per row, plus a pointer. Four indexes on a 14.9MB table came to 29.8MB here, so the table was a third
of what it occupied.

**Write time scales with how many indexes the table has, not with how big it is.** An insert adds an
entry to every index; a delete removes one from every index; an update to an indexed column does
both. Four indexes turned a 200,000-row bulk insert from 0.42s into 1.31s.

**Where that write cost lands is the part worth knowing, because it is not where people look for
it.** A single-row insert inside a web request barely notices: parsing, planning and committing one
statement cost far more than maintaining four B-trees, and 20,000 one-at-a-time inserts here went
from 2,455ms to 2,528ms, which is 1.03x. The cost is real and it collects in bulk paths, which means
backfills, imports and the migration that rewrites a column.

**An index no query uses pays both of those and returns nothing.** That is the one to go looking for,
and it is the reason "add an index" is a decision rather than a reflex.

## Worked example

200,000 rows, five columns, inserted in one statement. Same table, same data, varying only how many
indexes existed first. Two runs each.

```
                    insert        indexes on disk   (heap is 14.9MB throughout)
primary key only    458 / 418ms    4.3MB
      + 1 index     690 / 697ms   17.9MB
      + 2 indexes   876 / 930ms   19.1MB
      + 4 indexes  1305 / 1467ms  29.8MB
```

The first added index is on `email`, and on its own it accounts for 13.6MB against a table of 14.9MB.
A text column indexed is roughly that column stored a second time.

The same four indexes, loaded one row per statement instead:

```
primary key only   2455ms
      + 4 indexes  2528ms    1.03x
```

Nothing changed about the index maintenance between those two runs. What changed is what it is being
compared against.

Finding the ones that earn nothing is a single query, and `idx_scan` is the column that matters:

```sql
SELECT indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE relname = 'orders'
ORDER BY idx_scan;
```

## Traps

**Four indexes went on, the endpoint that writes did not get slower, so they were free.** They were
not free, they were hidden: per-statement overhead is the floor, and index maintenance sits under it
until something writes in bulk. The import job that used to take four minutes and now takes eleven is
the same four indexes presenting the bill.

**`idx_scan` is 0, so it is safe to drop.** Not if the index is enforcing something. 500 inserts that
each checked a `UNIQUE` constraint, including one that was correctly rejected as a duplicate, left
that index at `idx_scan = 0`; a single `SELECT` against the same column moved it to 1. The counter
records queries that searched the index, not the constraint work it does on write. Drop a unique
index by that number and you have dropped the rule, not the cost.

**The read got faster, so the index was the right call.** It always gets faster. The question the
plan cannot answer is whether that query mattered enough to pay for on every write and every backup
from now on, and the honest version of "should I add this index" is asked against the whole table's
index list rather than one query at a time.
