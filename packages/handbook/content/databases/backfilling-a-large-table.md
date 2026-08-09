---
title: Backfilling a large table
question: The backfill has to touch 500,000 rows. What does it do to everyone else?
order: 13
practise:
  - sqlperf-backfill-offset-skips
  - sqlperf-backfill-open-transaction
  - sqlperf-keyset-page
  - orm-not-null-on-a-full-table
  - orders-migration-postgres
sources:
  - author: PostgreSQL
    title: Routine Vacuuming
    url: https://www.postgresql.org/docs/current/routine-vacuuming.html
  - author: PostgreSQL
    title: Explicit Locking
    url: https://www.postgresql.org/docs/current/explicit-locking.html
  - author: PostgreSQL
    title: 'Server Configuration: Connection Settings'
    url: https://www.postgresql.org/docs/current/runtime-config-connection.html
verified: 2026-08-08
---

This page is Postgres. Every number on it was measured against PostgreSQL 17.10 on a table of 500,000
rows, not recalled. SQLite reaches most of the same conclusions for different reasons and is noted
where it diverges; the DDL half of this, which is a different subject, is
[migrations](../orms/migrations.md).

## The model

Start by deleting the thing you are worried about. **A bulk `UPDATE` does not lock readers out.** It
takes `ROW EXCLUSIVE` on the table, which Postgres documents as conflicting with "the SHARE, SHARE ROW
EXCLUSIVE, EXCLUSIVE, and ACCESS EXCLUSIVE lock modes" and therefore not with the `ACCESS SHARE` a
plain `SELECT` takes. Measured mid-backfill, with the `UPDATE` holding `RowExclusiveLock`, a
concurrent `SELECT` returned all 500,000 rows. Readers being locked out is a DDL problem, and the
`ALTER TABLE` that often travels with a backfill is where it comes from.

What a backfill actually spends is everything the database shares between workloads:

**A transaction ID, for as long as it runs.** One `UPDATE` over the whole table is one transaction. It
is also all-or-nothing, so a failure at 95% redoes the 95%, and while it runs nothing anywhere in the
cluster can be vacuumed past its snapshot. Batching is not a performance trick here; it is what turns
one long transaction into many short ones.

**Row versions.** Postgres does not overwrite: "an `UPDATE` or `DELETE` of a row does not immediately
remove the old version of the row", because that version "must not be deleted while it is still
potentially visible to other transactions". Touch every row once and you have written a second copy of
the table.

**Connections.** The backfill's workers come out of the same budget as the application's, and the
ceiling is server-wide: `max_connections` "default is typically 100". The arithmetic of pool size
against instance count is on
[scaling up and out](../systems/scaling-up-and-out.md), and a backfill is one more multiplier in it.

The measured shape of the second one, starting from 500,000 rows in a 25 MB heap, 39 MB with its
indexes:

```
                                        table     total    dead tuples
initial state                            25 MB     39 MB              0
after UPDATE of all 500,000 rows          57 MB     85 MB        500,000
after VACUUM                              57 MB     85 MB              0
```

`VACUUM` did its job. The file did not shrink, and that is documented rather than broken: standard
`VACUUM` "removes dead row versions in tables and indexes and marks the space available for future
reuse", but "will not return the space to the operating system". The goal "is not to keep tables at
their minimum size" but to hold a steady state. Budget the disk for the high-water mark, not the row
count.

## Worked example

Drive the batch cursor off the primary key, and let each batch tell you where the next one starts:

```sql
DO $$
DECLARE cursor_id bigint := 0; batch_max bigint;
BEGIN
  LOOP
    WITH batch AS (
      SELECT id FROM orders WHERE id > cursor_id ORDER BY id LIMIT 10000
    ), done AS (
      UPDATE orders o SET region = 'eu-west-1' FROM batch b WHERE o.id = b.id RETURNING o.id
    )
    SELECT max(id) INTO batch_max FROM done;

    EXIT WHEN batch_max IS NULL;
    cursor_id := batch_max;
  END LOOP;
END $$;
```

500,000 rows in 50 batches, 4.07 seconds, every row covered. Each iteration is its own transaction, so
the vacuum horizon moves along behind it and a crash costs you one batch. `cursor_id` is the whole
idea: it names a position in the table that the backfill's own writes cannot move, which an offset
does not.

In production the loop belongs in application code rather than in a `DO` block, because that is where
you can sleep between batches, watch replica lag, and stop. A `DO` block is one transaction from the
server's point of view if you let it be, which is the thing this design is avoiding.

## Traps

**The loop finished cleanly and half the rows are still null.** This is the shape almost everyone
writes first, a shrinking predicate paged with an advancing offset:

```sql
UPDATE orders SET region = 'eu-west-1'
WHERE id IN (SELECT id FROM orders WHERE region IS NULL ORDER BY id LIMIT 10000 OFFSET :n);
```

Measured over 500,000 rows: **250,000 of them were never touched**, and the loop exited normally with
no error. Batch one updates the first 10,000 rows, which removes them from `region IS NULL`, so
`OFFSET 10000` on the next pass steps over 10,000 rows that still need the update and lands past them.
Every batch skips exactly as many as it wrote. The offset counts into a set the backfill is changing
underneath itself, which is the same defect as
[paging a list](./pagination-at-the-database.md) while somebody inserts into it, except that here you
are the one doing the inserting. Drop the predicate from the cursor and page on the key.

**`VACUUM` reclaimed nothing, and the only other thing running was a report.** Measured: with one
idle `REPEATABLE READ` transaction open elsewhere in the database, `VACUUM` left all 500,000 dead
tuples in place. The reader committed, the identical `VACUUM` cleared every one of them. Nothing about
the reader was unusual and it never touched the rows being updated; a row version cannot be removed
while it is "still potentially visible", and an open snapshot is what "potentially visible" means. This
is why a backfill running against a database that also serves a long analytics query accumulates
garbage neither of them can clear, and why the fix is usually on the reporting side. Postgres names
where to look, which is `pg_stat_activity` for rows "where `age(backend_xid)` or `age(backend_xmin)`
is large".

**The backfill was throttled and the database still fell over.** Sleeping between batches limits how
much work you send and not how much you hold. A batch that takes a row lock and then sleeps inside the
same transaction is a writer blocking other writers for the length of the sleep. Commit the batch,
then sleep, in that order, and keep the transaction the width of one batch and nothing else. The same
reasoning applies to whatever else the loop does per batch: an HTTP call inside the transaction makes
the remote service's latency into your lock duration.
