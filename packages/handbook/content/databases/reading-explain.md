---
title: Reading EXPLAIN
question: The query is slow. What is the plan actually telling me?
order: 4
practise:
  - sqlperf-plan-scan-vs-search
  - sqlperf-plan-covering-index
  - sqlperf-plan-temp-btree-sort
  - sqlperf-plan-correlated-subquery
  - slow-list-endpoint-kysely
  - orders-report-typeorm
sources:
  - author: PostgreSQL
    title: Using EXPLAIN
    url: https://www.postgresql.org/docs/current/using-explain.html
  - author: PostgreSQL
    title: EXPLAIN
    url: https://www.postgresql.org/docs/current/sql-explain.html
  - author: SQLite
    title: EXPLAIN QUERY PLAN
    url: https://www.sqlite.org/eqp.html
  - author: Hubert Lubaczewski
    title: explain.depesz.com
    url: https://explain.depesz.com/
verified: 2026-08-01
---

Before it runs a query, the database works out a plan: which tables to read, in what order, and
whether an index helps. You can ask to see that plan, and when a query is slow it is usually where
the reason shows up, such as a whole table read to keep a handful of rows, or a small step repeated
many times. The output is dense, and a few lines carry most of the diagnosis.

## The model

Postgres is the engine here, because the workouts use it; SQLite's `EXPLAIN` is a different command,
shown after it. A plan is a tree. Each node pulls rows from the nodes indented under it, so the most
indented line runs first and the top line is the last thing that happens. Read it from the inside
out.

Plain `EXPLAIN` runs nothing. It prints the plan the planner chose and four estimates per node:

```
Seq Scan on orders  (cost=0.00..795.00 rows=240 width=23)
```

Startup cost is what has to happen before the first row can come out, which is why a `Sort` has a
large one and a `Seq Scan` has none. Total cost assumes the node runs to completion. Both are in
arbitrary units, so they are only useful compared against another plan for the same query, never read
as milliseconds. `rows` is the number the node emits after its own filtering, not the number it
looked at. `width` is the average row size in bytes.

`EXPLAIN ANALYZE` executes the statement and adds what really happened:

```
(actual time=0.035..2.743 rows=239.00 loops=1)
```

One detail does more damage than any other when it is missed. When a node runs more than once, the
actual time and row counts shown are averages per execution, and `loops` is how many executions there
were. A node reporting 0.001 ms with `loops=2000` cost two milliseconds, not one thousandth of one.
Multiply before you decide a node is cheap.

Four things to look for, in this order: a node whose estimated `rows` and actual `rows` differ by
orders of magnitude, because everything planned above it was planned on a fiction; a `loops` count
that tracks the number of rows in your result; a `Seq Scan` with a large `Rows Removed by Filter`
under a query that should be selective; and a `Sort` sitting on top of an index scan, which usually
means the index has the right columns in the wrong order.

## Worked example

The orders endpoint before anyone touched it, against 40,000 rows of which 239 are pending:

```
Limit  (cost=801.39..801.44 rows=20 width=23) (actual time=2.902..2.937 rows=20.00 loops=1)
  Buffers: shared hit=295
  ->  Sort  (cost=801.39..801.99 rows=240 width=23) (actual time=2.898..2.909 rows=20.00 loops=1)
        Sort Key: created_at DESC
        Sort Method: top-N heapsort  Memory: 19kB
        Buffers: shared hit=295
        ->  Seq Scan on orders  (cost=0.00..795.00 rows=240 width=23) (actual time=0.035..2.743 rows=239.00 loops=1)
              Filter: (status = 'pending'::text)
              Rows Removed by Filter: 39761
              Buffers: shared hit=295
Planning Time: 0.055 ms
Execution Time: 2.989 ms
```

`Rows Removed by Filter: 39761` is the whole diagnosis in one line: 40,000 rows read, 239 kept. The
estimate of 240 was accurate, so this is not a statistics problem, it is a missing index. Note also
that `rows=20` on the `Limit` and `rows=239.00` on the scan disagree by design, because `LIMIT` stops
pulling once it has enough.

Here is the `loops` trap in its natural habitat, from the same table joined to `customers`:

```
->  Index Scan using customers_pkey on customers c  (cost=0.28..0.52 rows=1 width=16)
      (actual time=0.001..0.001 rows=1.00 loops=20)
      Index Cond: (id = o.customer_id)
```

0.001 ms per customer lookup, twenty times, for a page of twenty. The per-node number never changes
as the page grows; only `loops` does.

SQLite answers the same question with `EXPLAIN QUERY PLAN`, and the entire output for the same query
is two lines:

```
SCAN orders
USE TEMP B-TREE FOR ORDER BY
```

`SCAN` is a full-table scan, `SEARCH` means only a subset of rows is visited, and `USE TEMP B-TREE`
means SQLite built a temporary structure to sort with. With the right index in place the second line
disappears and the first becomes
`SEARCH orders USING INDEX orders_status_created_at_idx (status=?)`.

## Traps

**The plan looked fine and the query is still slow.** Plain `EXPLAIN` is a prediction. Every number
in it is the planner describing what it believes about the data, and the reason to run
`EXPLAIN ANALYZE` is to find out where that belief is wrong. If estimated and actual rows are close,
the plan is honest and the problem is elsewhere. If they are three orders of magnitude apart, refresh
the statistics before changing anything else.

**`EXPLAIN ANALYZE` on a write statement actually writes.** The `ANALYZE` option executes the
statement; only a `SELECT`'s output is discarded. The documented way to plan an `INSERT`, `UPDATE`,
`DELETE` or `MERGE` without keeping the effect is `BEGIN;` then `EXPLAIN ANALYZE ...;` then
`ROLLBACK;`.

**Expecting SQLite's `EXPLAIN` to look like Postgres's.** Bare `EXPLAIN` in SQLite returns the
sequence of virtual machine opcodes it would run, one row per instruction, which is a debugging tool
for the engine and not for you. `EXPLAIN QUERY PLAN` is the one you want, and even that prints no
costs, no row estimates and no actual timings, so the estimate-against-actual technique has nothing
to work with. The SQLite docs also state that the output format of both is intended for interactive
troubleshooting and changes between releases, so do not build anything on top of parsing it.

**Reading a plan when the problem is the number of statements.** `EXPLAIN` tells you about one query.
An endpoint that runs a fast, well-planned query 200 times has 200 perfect plans and a four-second
response. That failure is invisible here and obvious in the statement log, which is what the
TypeORM report workout makes you look at. For a plan long enough that indentation stops helping,
`explain.depesz.com` takes a pasted `EXPLAIN ANALYZE` output and renders it as something readable.
