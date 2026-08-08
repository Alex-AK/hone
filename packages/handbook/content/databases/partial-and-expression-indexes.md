---
title: Partial and expression indexes
question: I only ever query one slice of this table, or a value computed from a column. How do I index that?
order: 11
practise:
  - sql-index-lower-email
  - slow-list-endpoint-kysely
  - product-search-drizzle
sources:
  - author: PostgreSQL
    title: Partial Indexes
    url: https://www.postgresql.org/docs/current/indexes-partial.html
  - author: PostgreSQL
    title: Indexes on Expressions
    url: https://www.postgresql.org/docs/current/indexes-expressional.html
  - author: PostgreSQL
    title: PREPARE
    url: https://www.postgresql.org/docs/current/sql-prepare.html
  - author: SQLite
    title: Partial Indexes
    url: https://www.sqlite.org/partialindex.html
  - author: SQLite
    title: Indexes On Expressions
    url: https://www.sqlite.org/expridx.html
verified: 2026-08-02
---

Two engines on this page, and where they disagree is most of the point. The Postgres plans and error
messages came from PostgreSQL 18.3 over the 40,000-row orders table the bug-hunt workout seeds. The
SQLite ones came from `practice.db` on SQLite 3.51.0. All of them were produced by running the
statement, not recalled.

[How an index gets used](./how-an-index-gets-used.md) is about whether the planner picks an index it
could use. [Column order](./composite-indexes-and-column-order.md) is about which columns go in one.
This page is the third question: what goes into the index at all.

## The model

A partial index carries a `WHERE` clause and holds only the rows that satisfy it. An expression index
stores the result of an expression instead of a stored column value. Both break the assumption every
other index rests on, that an entry corresponds to a column value in a row, and the planner rules
follow from that.

For a partial index the rule is implication. Postgres states it exactly: an index of this kind "can be
used in a query only if the system can recognize that the WHERE condition of the query mathematically
implies the predicate of the index". Recognize is the operative word, and neither engine has a theorem
prover behind it. Postgres handles simple inequality implications, `x < 1` implying `x < 2`, and
otherwise wants the predicate to match part of the query's `WHERE` condition exactly. SQLite is
blunter still: "The terms in W and X must match exactly. SQLite does not do algebra to try to get them
to look the same." Its one generous rule is worth knowing because it fires so often. A predicate of
`z IS NOT NULL` is implied by any of `=`, `<`, `>`, `<=`, `>=`, `<>`, `IN`, `LIKE` or `GLOB` on `z`,
since none of those can be true of a NULL, so `WHERE restocked_at > '2024-01-01'` uses an index
declared `WHERE restocked_at IS NOT NULL` without naming it.

For an expression index the rule is narrower and easier to hold: the planner matches the expression,
not the value it computes. An index on `lower(email)` serves `lower(email)` and nothing else, not
`upper(email)` and not a bare `email`. What you get back for that is a place to keep statistics.
Postgres has none for a derived value until an index names it, which is why the estimate in the
example below is wrong before and right after.

Both kinds constrain what you may write. The predicate or the expression is evaluated once at write
time and trusted forever after, so it has to give the same answer forever. Postgres calls that
IMMUTABLE, SQLite calls it deterministic, and neither will build the index otherwise. Expression
indexes also cost more to maintain than column ones, because the expression is recomputed on every
insert and on any update that touches it.

## Worked example

Two halves, because the two do different jobs.

**A slice of the rows.** The orders list in the bug-hunt workout only ever asks for pending. Of the
40,000 rows, 239 are `pending`, 3,615 `cancelled`, 12,049 `paid` and 24,097 `shipped`.

```sql
CREATE INDEX orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX orders_pending_idx    ON orders (created_at DESC) WHERE status = 'pending';
```

`pg_relation_size` puts the first at 896 kB and the second at 16 kB. The list query against the
second:

```
Limit  (cost=0.14..1.51 rows=20 width=16)
  ->  Index Scan using orders_pending_idx on orders  (cost=0.14..16.79 rows=243 width=16)
```

No `Index Cond` line and no `Filter` line, because nothing is left to check. Every entry in that index
is a pending order and they are already in `created_at` order, so the twenty rows come straight off
the front. Ask for another status and the index is not unhelpful, it is inapplicable:

```
Limit  (cost=1116.74..1116.79 rows=20 width=16)
  ->  Sort  (cost=1116.74..1146.96 rows=12091 width=16)
        Sort Key: created_at DESC
        ->  Seq Scan on orders  (cost=0.00..795.00 rows=12091 width=16)
              Filter: (status = 'paid'::text)
```

**A computed value.** `sql-index-lower-email` is this in one line: login worked off the index on
`email` until somebody made it case-insensitive. Against 800 customers:

```
Seq Scan on customers  (cost=0.00..20.00 rows=4 width=4)
  Filter: (lower(email) = 'customer42@example.com'::text)
```

`rows=4` is 0.5% of 800, the fixed fraction Postgres falls back on with no statistics for what the
query asks about. Add the index:

```sql
CREATE INDEX customers_lower_email_idx ON customers (lower(email));
```

```
Index Scan using customers_lower_email_idx on customers  (cost=0.28..8.29 rows=1 width=4)
  Index Cond: (lower(email) = 'customer42@example.com'::text)
```

The estimate is now right as well as the access method. `ANALYZE` gathers statistics for the index's
expression once an index exists to name it, and `pg_stats` gains a row for
`customers_lower_email_idx`. Postgres describes the effect as the system seeing the query "as just
`WHERE indexedcolumn = 'constant'`".

SQLite says the same in its own notation, against `practice.db`:

```
sqlite> CREATE INDEX customers_lower_email_idx ON customers (lower(email));
sqlite> EXPLAIN QUERY PLAN SELECT id FROM customers WHERE lower(email) = 'dana@example.com';
SEARCH customers USING COVERING INDEX customers_lower_email_idx (<expr>=?)
```

`<expr>` is how SQLite prints an indexed expression it has matched. Change `lower` to `upper` in the
query and the plan is `SCAN customers`.

## Traps

**The condition means exactly what the predicate means, and the plan is a scan.** Against
`orders_pending_idx`, Postgres will not use it for
`status <> 'shipped' AND status <> 'paid' AND status <> 'cancelled'`, though on a four-value column
those are the same 239 rows: `Seq Scan on orders ... rows=10112`. SQLite refuses the same shape even
where a `CHECK` constraint proves it. `practice.db` allows two statuses, and against a partial index
declared `WHERE status = 'cancelled'` the query `WHERE status <> 'completed'` plans as `SCAN orders`.
The one piece of algebra Postgres does is narrowing an inequality: a partial index
`WHERE total_cents > 50000` serves `total_cents > 80000` and not `total_cents > 20000`. SQLite does
not do even that, and skips a `WHERE rating > 3` index for `rating > 4`. Lists are their own trap:
`status IN ('pending', 'paid')` is not implied by `status = 'pending'` and scans on both, while the
one-element `status IN ('pending')` uses the index on Postgres, which rewrites it to equality, and
scans on SQLite, which does not.

**It uses the index in the SQL console and not from the application.** The predicate arrived as a
parameter. Postgres's docs say parameterized query clauses do not work with a partial index, and the
mechanism underneath is why this shows up late rather than never: a prepared statement's first five
executions are planned with the real values, and only after that may the server switch to a generic
plan. The same statement, forced each way:

```
-- plan_cache_mode = force_custom_plan
Limit  (cost=0.14..1.53 rows=20 width=12)
  ->  Index Scan using orders_pending_idx on orders  (cost=0.14..16.74 rows=240 width=12)

-- plan_cache_mode = force_generic_plan
Limit  (cost=1061.10..1061.15 rows=20 width=12)
  ->  Sort  (cost=1061.10..1086.10 rows=10000 width=12)
        Sort Key: created_at DESC
        ->  Seq Scan on orders  (cost=0.00..795.00 rows=10000 width=12)
              Filter: (status = $1)
```

SQLite draws the line at definition time instead. Its predicate "may not contain subqueries,
references to other tables, non-deterministic functions, or bound parameters", and a query written
`WHERE status = ?` plans as `SCAN orders`. A partial index pays off against a condition the planner
can read as a constant, which usually means the slice is named in the code rather than passed in.

**`CREATE INDEX` fails with a message about IMMUTABLE or determinism.** Something in the expression or
the predicate can change its answer without the row changing. The common one in Postgres is
`date_trunc('day', created_at)` over a `timestamptz`, which reads the session's `TimeZone` setting:
`ERROR: functions in index expression must be marked IMMUTABLE`. Pin the zone and it builds, as
`ON orders ((created_at AT TIME ZONE 'UTC'))`. `now()` in a predicate gives the matching
`ERROR: functions in index predicate must be marked IMMUTABLE`, which is what kills the tempting
"index only the last 30 days". SQLite rejects `random()` while parsing, with
`non-deterministic functions prohibited in index expressions`, and rejects
`date(ordered_at, 'localtime')` while building, with `non-deterministic use of date() in an index`. A
recency index has to be defined against a fixed cutoff that you move by rebuilding it.

**Signing up with an address that was soft-deleted last year is rejected as a duplicate.** The unique
constraint covers rows nobody can see. This is the partial index that has nothing to do with read
speed, and both engines support it:

```sql
CREATE UNIQUE INDEX users_email_live ON users (email) WHERE deleted_at IS NULL;
```

A deleted `a@example.com` and a live one now coexist, and a second live one fails:
`duplicate key value violates unique constraint "users_email_live"` in Postgres,
`UNIQUE constraint failed: users.email` in SQLite. Uniqueness is enforced over the indexed rows, so
choosing which rows are indexed is choosing what the constraint means.
