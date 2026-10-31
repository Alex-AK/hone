---
title: How an index actually gets used
question: I added the index and the query is still slow. Why is the planner ignoring it?
order: 2
practise:
  - slow-list-endpoint-kysely
  - product-search-drizzle
  - sql-like-search
  - sql-top-recent
sources:
  - author: Markus Winand
    title: Case-Insensitive Search Using UPPER or LOWER
    url: https://use-the-index-luke.com/sql/where-clause/functions/case-insensitive-search
  - author: PostgreSQL
    title: Statistics Used by the Planner
    url: https://www.postgresql.org/docs/current/planner-stats.html
  - author: PostgreSQL
    title: Pattern Matching
    url: https://www.postgresql.org/docs/current/functions-matching.html
  - author: SQLite
    title: The SQLite Query Optimizer Overview
    url: https://www.sqlite.org/optoverview.html
verified: 2026-08-01
---

Adding an index to a slow query is the usual first move, and the database is free to ignore it. It
first checks whether your condition is the kind of question the index can answer, then guesses
whether going through the index beats reading the whole table. Sometimes the honest answer is no,
and sometimes the way the query is written rules the index out before any guessing starts.

## The model

An index is a second copy of a few columns, kept sorted, with a pointer back to the row it came from.
That shape gives it two jobs and no others: find a contiguous range of entries without reading the
rest, and hand rows back in the order they are already stored in. Anything the query needs beyond
that happens after the index has finished.

So a condition reaches the index only if it can be rewritten as a range on an indexed column.
`status = 'pending'` is a range of one value. `created_at >= '2023-09-01'` is a range with an open
end. `lower(status) = 'pending'` is not a range on anything, because the index stores `status` and
the query is asking about a different value derived from it. Markus Winand's framing is that the
function is a black box to the optimiser: there is no general relationship between what goes in and
what comes out, so a plain index on the column is unusable and a function-based index on the
expression is the fix.

Passing that test gets you considered, not chosen. Reading through an index means following each
match back to the table, and past some fraction of the table it is cheaper to read the whole thing in
order. Postgres decides with statistics in `pg_statistic`, updated by `ANALYZE` and `VACUUM ANALYZE`,
and the docs are blunt that they are "always approximate even when freshly updated". SQLite makes the
same kind of guess, and without `ANALYZE` having been run it is guessing at "the shape of the data"
from defaults.

Two questions, in order, whenever an index looks ignored. Can the condition become a range on an
indexed column? And does the planner believe that range is small enough to be worth the trip?

## Worked example

The plans are from PostgreSQL 18, which the query-plan workouts run. The orders list from the
bug-hunt workout: 40,000 orders, and the statuses are lopsided the way real
ones are. 239 are `pending`, 24,097 are `shipped`. There is an index on `status` alone.

Filtering to `pending` uses it:

```
Limit  (cost=309.58..309.63 rows=20 width=23)
  ->  Sort  (cost=309.58..310.18 rows=241 width=23)
        Sort Key: created_at DESC
        ->  Bitmap Heap Scan on orders  (cost=6.16..303.16 rows=241 width=23)
              Recheck Cond: (status = 'pending'::text)
              ->  Bitmap Index Scan on orders_status_idx  (cost=0.00..6.10 rows=241 width=0)
                    Index Cond: (status = 'pending'::text)
```

Change one string literal and the same index goes untouched:

```
Limit  (cost=1436.53..1436.58 rows=20 width=23)
  ->  Sort  (cost=1436.53..1496.80 rows=24109 width=23)
        Sort Key: created_at DESC
        ->  Seq Scan on orders  (cost=0.00..795.00 rows=24109 width=23)
              Filter: (status = 'shipped'::text)
```

Nothing is broken there. Fetching 24,109 rows through an index and chasing each one back to the table
costs more than reading 40,000 rows in physical order, and the planner priced both. The index is
worth having because of the `pending` case, not despite the `shipped` one.

Wrap the column in a function and the index stops being an option at all, whatever the selectivity:

```
Seq Scan on orders  (cost=0.00..895.00 rows=200 width=4)
  Filter: (lower(status) = 'pending'::text)
```

`rows=200` is not a number that came from the data: it is exactly 0.5% of the table, a fixed guess.
Postgres keeps statistics per column, and it has none for `lower(status)`, which is the same reason
the index on `status` does not apply.

## Traps

**The index exists, the plan still says `Seq Scan`, and nothing is wrong.** Check what fraction of the
table the predicate matches before assuming a bug. `shipped` is 60% of that table, and a filter that
keeps 60% of the rows has no index-shaped answer. The same arithmetic runs the other way: an index
that looks useless against a development database with a few hundred rows in it is doing real work in
production, because the planner is choosing on size. The plan worth reading is the one against
production-sized data.

**Making the search case-insensitive turned the index off.** `WHERE lower(email) = $1` needs an index
on `lower(email)`, not on `email`. In Postgres, `ILIKE` is a case-insensitive `LIKE` and a Postgres
extension rather than standard SQL, and the pattern the product-search workout builds wraps the term
in `%` on both sides. A leading wildcard has no prefix to seek to, so a B-tree cannot help; that
search wants a trigram or full-text index, or an honest acceptance that it scans.

**On SQLite, `LIKE 'pend%'` scans even though it looks like a prefix range.** SQLite's `LIKE` is
case-insensitive for ASCII by default, so `'a' LIKE 'A'` is true while `'æ' LIKE 'Æ'` is false. Its
`LIKE`-to-range optimisation therefore requires the index collation to match the `case_sensitive_like`
setting: with the pragma off, only an index declared `COLLATE NOCASE` qualifies. A plain
`CREATE INDEX p_name ON p (name)` serves `name = 'widget'` and gets skipped for `name LIKE 'wid%'`.
There is no `ILIKE` in SQLite; it is a syntax error.

**Practising the plan and practising the query are different reps.** The SQL problems run against a
small SQLite practice database with no indexes on it at all, so every one of them is a scan and that
is fine. `sql-like-search` and `sql-top-recent` are there to drill the query shape. The workouts are
where an index either gets used or does not.
