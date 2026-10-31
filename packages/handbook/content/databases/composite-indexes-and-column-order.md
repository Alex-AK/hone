---
title: Composite indexes and column order
question: The index covers both columns. Why does one query use it and the other one doesn't?
order: 3
practise:
  - slow-list-endpoint-kysely
  - sql-top-recent
  - sql-dedupe-keep-latest
sources:
  - author: Markus Winand
    title: Concatenated Indexes
    url: https://use-the-index-luke.com/sql/where-clause/the-equals-operator/concatenated-keys
  - author: PostgreSQL
    title: Multicolumn Indexes
    url: https://www.postgresql.org/docs/current/indexes-multicolumn.html
  - author: PostgreSQL
    title: Indexes and ORDER BY
    url: https://www.postgresql.org/docs/current/indexes-ordering.html
  - author: SQLite
    title: The SQLite Query Optimizer Overview
    url: https://www.sqlite.org/optoverview.html
verified: 2026-08-01
---

An index on two columns is sorted by the first, and by the second only among rows that share the
first. So the order you list the columns in decides which queries it can speed up, and whether their
results come out already sorted or need sorting afterwards. Get the order backwards and the index
still shows up in the plan, doing half its job.

## The model

`CREATE INDEX ix ON t (a, b)` does not build two indexes. It builds one, sorted by `a`, and sorted by
`b` only within each run of equal `a`. A phone book ordered by surname then first name is the same
object. Finding every Winand is quick, and so is finding the one Winand called Markus. Finding
everyone called Markus means reading the whole book.

That is the leftmost-prefix rule. An index on `(a, b, c)` answers queries on `a`, on `a` and `b`, and
on all three. Postgres states it more precisely than "prefix or nothing", and the precision matters:
equality constraints on the leading columns, plus any inequality constraint on the first column that
has no equality constraint, limit the portion of the index that gets scanned. Constraints on columns
to the right of that are still checked inside the index, which saves visits to the table, but they do
not necessarily reduce how much of the index has to be read.

Two consequences worth carrying around. Equality columns go first, then the single column you range
over or sort by, because everything after the first inequality stops narrowing the scan. And the
second job of an index is order: when the index's sort matches the query's `ORDER BY`, the rows come
out ready and the plan has no sort step in it at all.

## Worked example

The plans are from PostgreSQL 18, with SQLite's equivalents alongside.
`GET /orders?status=pending` in the bug-hunt workout runs one query: filter on `status`, order by
`created_at` descending, take 20. There are 40,000 orders and 239 of them are pending.

With an index on `status` alone, Postgres finds the 239 rows and then sorts them:

```
Limit  (cost=309.58..309.63 rows=20 width=23)
  ->  Sort  (cost=309.58..310.18 rows=241 width=23)
        Sort Key: created_at DESC
        ->  Bitmap Heap Scan on orders  (cost=6.16..303.16 rows=241 width=23)
              Recheck Cond: (status = 'pending'::text)
              ->  Bitmap Index Scan on orders_status_idx  (cost=0.00..6.10 rows=241 width=0)
                    Index Cond: (status = 'pending'::text)
```

Put `created_at` into the index behind `status`, in the direction the query asks for:

```sql
CREATE INDEX orders_status_created_at_idx ON orders (status, created_at DESC);
```

```
Limit  (cost=0.29..50.98 rows=20 width=23)
  ->  Index Scan using orders_status_created_at_idx on orders  (cost=0.29..618.71 rows=244 width=23)
        Index Cond: (status = 'pending'::text)
```

The `Sort` node is gone, and with it the need to fetch all 239 matches before returning the first 20.
The scan stops after 20 because the index hands them over in order, and `EXPLAIN ANALYZE` puts the
whole statement at 0.061 ms against 0.616 ms. SQLite tells the same story in
two lines: `SEARCH orders USING INDEX orders_status_idx (status=?)` followed by
`USE TEMP B-TREE FOR ORDER BY`, and then, once the composite index exists,
`SEARCH orders USING INDEX orders_status_created_at_idx (status=?)` on its own.

## Traps

**The index is being used and there is still a sort in the plan.** Usually the directions do not line
up. A B-tree can be walked from either end, so reversing every term of the `ORDER BY` is free:
against `(status, created_at DESC)`, asking for `status DESC, created_at ASC` gives you
`Index Scan Backward`. Mixing them does not work, because no single walk produces it:

```
Limit  (cost=808.49..809.95 rows=20 width=19)
  ->  Incremental Sort  (cost=808.49..3733.16 rows=40000 width=19)
        Sort Key: status, created_at
        Presorted Key: status
        ->  Index Scan using orders_status_created_at_idx on orders  (cost=0.29..2168.69 rows=40000 width=19)
```

`ASC` and `DESC` are options on `CREATE INDEX` for exactly this reason. SQLite's version of the same
plan says `USE TEMP B-TREE FOR LAST TERM OF ORDER BY`, which names the problem more clearly than
Postgres does.

**The range column got put first.** `WHERE created_at >= $1 AND status = 'pending'` against an index
on `(created_at, status)` reads every entry in the date range and checks `status` on each one. Move
the equality in front and the scan starts at the pending rows and covers only those. This is the
single most common way a composite index ends up being half an index.

**One index per query, and the table now has six.** An index on `(status, created_at)` already serves
queries on `status` alone, so a separate index on `(status)` is redundant: extra writes on every
insert, extra pages, no new answers. Look for prefixes you already have before adding another.

**Reading that leading columns are mandatory, and designing around it.** Both engines can use an
index whose leading column is unconstrained when that column has very few distinct values, by
stepping through the distinct values one at a time. Postgres 18 shows it as extra index searches,
and earlier releases do not skip; SQLite writes the condition as `ANY(status) AND created_at>?`. It
is a rescue, not a design: SQLite only attempts it when `ANALYZE` has been run and it estimates
around 18 or more duplicates per leading value, so on a database nobody has analysed it never
happens at all.
