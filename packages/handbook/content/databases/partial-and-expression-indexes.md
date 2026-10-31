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

Sometimes you only ever look up a small slice of a table, or search on a value worked out from a
column, like an email address in lower case. You can index exactly that, and get something smaller
and faster, but the database uses it only when your query asks in a form it recognises.

## The model

**The planner uses a partial or expression index only when it can match your query to the index's
definition, and it matches far more literally than you would.** A partial index carries a `WHERE`
clause and holds only the rows that satisfy it. An expression index stores the result of an
expression instead of a column value. Postgres and SQLite both support them, and where they disagree
is marked.

For a partial index the rule is implication. Postgres states it exactly: an index of this kind "can
be used in a query only if the system can recognize that the WHERE condition of the query
mathematically implies the predicate of the index". Neither engine has a theorem prover behind it.
Postgres handles simple inequalities, `x < 1` implying `x < 2`, and otherwise wants the predicate to
match part of the query's `WHERE` exactly. SQLite is blunter: "The terms in W and X must match
exactly. SQLite does not do algebra to try to get them to look the same." Its one generous rule
fires often. A predicate of `z IS NOT NULL` is implied by any of `=`, `<`, `>`, `<=`, `>=`, `<>`,
`IN`, `LIKE` or `GLOB` on `z`, since none of those can be true of a NULL, so
`WHERE restocked_at > '2024-01-01'` uses an index declared `WHERE restocked_at IS NOT NULL`.

For an expression index the planner matches the expression, not the value it computes. An index on
`lower(email)` serves `lower(email)` and nothing else, not `upper(email)` and not a bare `email`. In
return you get a place to keep statistics: Postgres has none for a derived value until an index
names it, which is why the estimate in the example below is wrong before and right after.

Both kinds constrain what you may write. The predicate or expression is evaluated at write time and
trusted forever after, so it has to give the same answer forever. Postgres calls that IMMUTABLE,
SQLite calls it deterministic, and neither will build the index otherwise.

[How an index gets used](./how-an-index-gets-used.md) and [column
order](./composite-indexes-and-column-order.md) cover whether an index is picked and which columns
go in it. This page is about which rows and values go in at all.

## Worked example

Every plan and error here came from running the statement. The Postgres ones are PostgreSQL 18.3
over the 40,000-row orders table the bug-hunt workout seeds, and the SQLite ones are `practice.db`
on SQLite 3.51.0.

**A slice of the rows.** The orders list in the bug-hunt workout only ever asks for pending orders,
and 239 of the rows are `pending`.

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

No `Index Cond` and no `Filter`: every entry is a pending order already in `created_at` order, so
the twenty rows come straight off the front. Ask for another status and the index cannot be used at
all:

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

The estimate is now right too. Once an index names the expression, `ANALYZE` gathers statistics for
it and `pg_stats` gains a row for `customers_lower_email_idx`. The Postgres docs describe the effect
as the system seeing the query as a plain comparison of an indexed column with a constant.

SQLite says the same in its own notation, against `practice.db`:

```
sqlite> CREATE INDEX customers_lower_email_idx ON customers (lower(email));
sqlite> EXPLAIN QUERY PLAN SELECT id FROM customers WHERE lower(email) = 'dana@example.com';
SEARCH customers USING COVERING INDEX customers_lower_email_idx (<expr>=?)
```

`<expr>` is how SQLite prints an indexed expression it has matched. Change `lower` to `upper` in the
query and the plan is `SCAN customers`.

## Traps

**The condition means exactly what the predicate means, and the plan is a scan.** Postgres will not
use `orders_pending_idx` for `status <> 'shipped' AND status <> 'paid' AND status <> 'cancelled'`,
though on a four-value column those are the same rows: `Seq Scan on orders ... rows=10112`. SQLite
refuses the same shape even where a `CHECK` constraint proves it: `practice.db` allows two statuses,
and against an index declared `WHERE status = 'cancelled'` the query `WHERE status <> 'completed'`
plans as `SCAN orders`. Postgres does narrow an inequality, so an index `WHERE total_cents > 50000`
serves `total_cents > 80000` and not `total_cents > 20000`. SQLite skips a `WHERE rating > 3` index
even for `rating > 4`. And `status IN ('pending', 'paid')` is not implied by `status = 'pending'`,
so it scans on both, while the one-element `status IN ('pending')` uses the index on Postgres, which
rewrites it to equality, and scans on SQLite, which does not.

**It uses the index in the SQL console and not from the application.** The predicate arrived as a
parameter. The Postgres docs say parameterized query clauses do not work with a partial index, and
this shows up late rather than never because a prepared statement's first five executions are
planned with the real values. Only after that may the server switch to a generic plan. The same
statement, forced each way:

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

SQLite draws the line at definition time instead: its docs rule out subqueries, other tables,
non-deterministic functions and bound parameters in the predicate, and a query written
`WHERE status = ?` plans as `SCAN orders`. A partial index helps only against a condition the
planner can read as a constant, which usually means the slice is named in the code rather than
passed in.

**`CREATE INDEX` fails with a message about IMMUTABLE or determinism.** Something in the expression
or the predicate can change its answer without the row changing. The common one in Postgres is
`date_trunc('day', created_at)` over a `timestamptz`, which reads the session's `TimeZone` setting:
`ERROR: functions in index expression must be marked IMMUTABLE`. Pin the zone and it builds, as
`ON orders ((created_at AT TIME ZONE 'UTC'))`. `now()` in a predicate gives the matching
`ERROR: functions in index predicate must be marked IMMUTABLE`, which is what kills the tempting
"index only the last 30 days". SQLite rejects `random()` while parsing, with
`non-deterministic functions prohibited in index expressions`, and rejects
`date(ordered_at, 'localtime')` while building, with `non-deterministic use of date() in an index`.
A recency index has to use a fixed cutoff that you move by rebuilding it.

**Signing up with an address that was soft-deleted last year is rejected as a duplicate.** The
unique constraint covers rows nobody can see. This partial index is not about read speed, and both
engines support it:

```sql
CREATE UNIQUE INDEX users_email_live ON users (email) WHERE deleted_at IS NULL;
```

A deleted `a@example.com` and a live one now coexist, and a second live one fails:
`duplicate key value violates unique constraint "users_email_live"` in Postgres,
`UNIQUE constraint failed: users.email` in SQLite. Uniqueness is enforced over the indexed rows, so
choosing which rows are indexed is choosing what the constraint means.
