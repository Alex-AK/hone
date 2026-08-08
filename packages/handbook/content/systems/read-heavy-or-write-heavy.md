---
title: Read-heavy or write-heavy
question: The database is the bottleneck. Do I need a replica, a shard, a cache or an index?
order: 7
practise:
  - sys-cache-aside-vs-write-through
  - sql-index-unused-cost
sources:
  - author: PostgreSQL
    title: 'Monitoring Database Activity: The Cumulative Statistics System'
    url: https://www.postgresql.org/docs/current/monitoring-stats.html
  - author: PostgreSQL
    title: Heap-Only Tuples (HOT)
    url: https://www.postgresql.org/docs/current/storage-hot.html
  - author: PostgreSQL
    title: pg_stat_statements
    url: https://www.postgresql.org/docs/current/pgstatstatements.html
  - author: PostgreSQL
    title: Log-Shipping Standby Servers
    url: https://www.postgresql.org/docs/current/warm-standby.html
verified: 2026-08-07
---

Postgres is the engine here. Every number below was measured on PGlite 0.5.4, which is PostgreSQL
18.3 compiled to wasm. They are counts rather than timings, so the wasm build changes nothing about
them.

## The model

Five mechanisms, and each one is a bet on which way a single number leans.

- **[Replication](./replication.md)** buys read throughput. A standby "continuously applies WAL
  received from the primary server", so it performs every write the primary did.
- **[Caching](./caching-patterns.md)** buys read throughput and pays in staleness.
- **[Sharding](./sharding-and-partitioning.md)** is the only one that moves a write ceiling, and it
  costs you anything that crosses the split.
- **[An index](../databases/what-an-index-costs.md)** buys one query's reads and charges every write
  to the table.
- **[More instances](./scaling-up-and-out.md)** buys web-tier capacity and changes nothing about the
  database.

None of that is subtle, and it is not where the mistake happens. The mistake is in the number, which
is quoted more often than it is measured, and it goes wrong in two places before anyone reaches the
list above.

**A table has a ratio. An application does not.** One request can touch three tables and lean a
different way on each: read a catalogue, update a session row, insert an analytics row. "We are
read-heavy" is the busiest table's number wearing the whole database's name, and the table in
trouble is rarely the busiest one.

**A ratio counted in requests is a different number from a ratio counted in statements**, and the
translation fails in both directions. A read request writes: a session touch, a view counter, an
analytics row, an audit line. A write request reads: the row it is about to update, the uniqueness
check, the permission lookup. The mechanisms respond to statements. The dashboard counts requests.

The per-table number lives in `pg_stat_user_tables` and accumulates until something resets it. Reads
are `seq_scan` and `idx_scan`, the "number of index scans initiated on this table" and the
sequential equivalent. Writes are `n_tup_ins`, `n_tup_upd` and `n_tup_del`, which count rows rather
than statements, so one `DELETE` clearing 40,000 rows counts as 40,000. For the same question per
statement, `pg_stat_statements` carries `calls` and `rows` for each one the server executed, which
is how you find the one statement responsible.

**Then the correction that makes those columns readable: a write's own lookup counts as a read.**
`UPDATE sessions SET last_seen = now() WHERE id = $1` finds its row through the primary key, and
that is an index scan on the table. 50 such updates, with no `SELECT` anywhere, leave `idx_scan` at
50 and `n_tup_upd` at 50. A table whose scan count tracks its write count one for one is not being
read at all.

Last, the window you measure over. The statistics "lag behind actual activity" by up to a second,
which does not matter. What does is that a ratio is an average over however long you have been
counting, and writes arrive in clumps that a day-long average erases. A table read 500 times per
write across a day is write-bound for the ten minutes of the nightly import, and those ten minutes
are what you are being paged about.

## Worked example

1,000 requests against a category page. Every one is a `GET`, and every one runs three statements:
read the products in a category, touch the session row, record the view.

```sql
SELECT relname, seq_scan, idx_scan, idx_tup_fetch, n_tup_ins, n_tup_upd
FROM pg_stat_user_tables
ORDER BY relname;
```

```
              seq_scan  idx_scan  idx_tup_fetch  n_tup_ins  n_tup_upd

products             0     1,000         20,000          0          0
sessions             0     1,000          1,000          0      1,000
page_views           0         0              0      1,000          0
```

The request log for that hour says 1,000 reads and no writes. The three tables disagree with it, and
with each other.

**products** is read and never written, and it is the only one of the three that a cache or a
replica helps. The 20,000 rows fetched are the page size, 20 per request.

**sessions** shows 1,000 scans against 1,000 updates, and by the rule above those scans are the
updates' own lookups. Nothing read this table. It took 1,000 writes out of 1,000 requests that were
all reads, and no read-side mechanism touches it.

**page_views** is append-only: 1,000 inserts and no reads at all until somebody runs a report. Its
questions are retention and partitioning, not caching.

An application-level ratio over this hour would come out as 2,000 scans against 2,000 writes, one to
one. No table on the list is anywhere near one to one.

## Traps

**The read replica went in, reads got faster, and the write timeouts are exactly where they were.**
The ratio it was bought against was the whole database's, set by one large read-heavy table, and the
table timing out is a different one. A standby performs every write the primary did, so a write
ceiling is the one thing an extra copy cannot move. Measure per table first; if the table in trouble
takes mostly writes, the mechanism is [sharding](./sharding-and-partitioning.md).

**Traffic is 40 GETs to every POST and the database is busiest on writes.** Every GET writes
something: a `last_seen` touch, a view counter, a row in an analytics table. Counted at the request,
the workload is 40 to 1 in favour of reads. Counted at the table it is close to even, and the tables
carrying those writes are not the ones the reads go to. Argue with the number from
`pg_stat_user_tables`, not the one from the access log.

**The index fixed the slow page, the writes got more expensive, and nothing on the dashboard
changed.** The column you indexed is one that gets updated. Postgres can update a row without
touching any index when the update "does not modify any columns referenced by the table's indexes"
and the page has room for the new version, which is a heap-only tuple. Before an index on
`last_seen`, 741 of 1,000 `UPDATE sessions SET last_seen` updates were HOT. After it, none were:
every update now writes an index entry too, and `n_dead_tup` for the table came out at 1,000 instead
of 260, which is work autovacuum inherits. `n_tup_hot_upd` beside `n_tup_upd` is where that shows
up, and nothing on an application dashboard does.
