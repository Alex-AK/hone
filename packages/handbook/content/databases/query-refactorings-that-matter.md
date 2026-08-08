---
title: Query refactorings that matter
question: I rewrote the query and got the same rows back. Did the database actually do less work?
order: 10
practise:
  - sql-not-exists
  - sql-anti-join
  - sqlperf-exists-not-count
  - sqlperf-scalar-subquery-to-join
  - sqlperf-limit-before-join
  - sql-repeat-customers
  - sql-union-cities
  - slow-list-endpoint-kysely
sources:
  - author: PostgreSQL
    title: Subquery Expressions
    url: https://www.postgresql.org/docs/current/functions-subquery.html
  - author: PostgreSQL
    title: Using EXPLAIN
    url: https://www.postgresql.org/docs/current/using-explain.html
  - author: PostgreSQL
    title: Combining Queries (UNION, INTERSECT, EXCEPT)
    url: https://www.postgresql.org/docs/current/queries-union.html
  - author: SQLite
    title: The SQLite Query Optimizer Overview
    url: https://www.sqlite.org/optoverview.html
  - author: SQLite
    title: Status Parameters for prepared statements
    url: https://www.sqlite.org/c3ref/c_stmtstatus_counter.html
verified: 2026-08-02
---

Both engines are on this page, and the numbers are separated by engine. The SQLite counters came from
the `sqlite3` shell, version 3.51.0, with `.stats on`, against `practice.db` and against a scratch
database built for the OR example, because `practice.db` has no indexes on it. The Postgres plans
came from `EXPLAIN ANALYZE` on PostgreSQL 18.3, against a table of 200,000 orders and 5,000 customers
built for this page.

## The model

Most SQL rewrites are cosmetic: the planner sees through them and produces the same plan. The ones
worth learning change what the planner is allowed to consider. Three of them come up often enough to
recognise on sight, and they share a shape. Each takes a decision the planner cannot make on your
behalf and makes it in the SQL.

**Ask whether, not how many.** `(SELECT count(*) FROM …) > 0` is an aggregate, so it has to visit
every matching row before it can compare anything. `EXISTS` is a predicate over the same rows, and
Postgres documents the difference: the subquery "will generally only be executed long enough to
determine whether at least one row is returned, not all the way to completion". Early exit is the
smaller half. The bigger half is that `EXISTS` is a form the planner can lift into the join, and an
aggregate is not.

**Give each branch of an `OR` its own access path.** A planner picks one way into each table per
query. SQLite says so directly, and names the exception: "in most cases, SQLite will only use a
single index for each table in the FROM clause of a query. The second OR-clause optimization
described here is the exception to that rule." So an `OR` over two columns of one table is already
handled, by SQLite splitting it across two indexes and by Postgres building a `BitmapOr`. What
neither can do is split an `OR` whose branches live in different tables, because by then it is a
condition on the joined row and there is nothing to seek to on either side. That is the case where
writing the two branches out as a `UNION` changes the plan.

**Unpick a correlated subquery.** A correlated scalar subquery in the select list is evaluated once
per output row, and both engines say so in the plan: `CORRELATED SCALAR SUBQUERY` in SQLite, a
`SubPlan` with `loops=N` in Postgres. A `LEFT JOIN` with a `GROUP BY` asks for the same numbers once,
for the whole set, in one pass.

None of the three changes which rows come back, if you get the details right, and the details are
where they go wrong. That is what the traps are about.

## Worked example

`practice.db` has 10 customers and 20 orders and no indexes, which is too small to time and exactly
big enough to count. `.stats on` in the shell prints two counters that are deterministic where a
stopwatch is not: "Fullscan Steps", which SQLite defines as "the number of times that SQLite has
stepped forward in a table as part of a full table scan", and "Virtual Machine Steps", which the same
page offers as "a proxy for the total work done by the prepared statement".

Which customers have a completed order, asked two ways:

```sql
-- 199 fullscan steps, 999 VM steps
SELECT c.name FROM customers c
WHERE (SELECT COUNT(*) FROM orders o
       WHERE o.customer_id = c.id AND o.status = 'completed') > 0;

-- 91 fullscan steps, 499 VM steps
SELECT c.name FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o
              WHERE o.customer_id = c.id AND o.status = 'completed');
```

Same 8 names, less than half the work, and `EXPLAIN QUERY PLAN` prints the identical three lines for
both. At production size the same rewrite is not a factor of two. Here it is on Postgres, asking
which of 5,000 customers hold one of the 200 refunded orders in a table of 200,000. The
`count(*) > 0` version stayed a `SubPlan`:

```
Seq Scan on customers c (actual rows=5.00 loops=1)
  Filter: ((SubPlan 1) > 0)
  Rows Removed by Filter: 4995
  SubPlan 1
    ->  Aggregate (actual rows=1.00 loops=5000)
          ->  Bitmap Heap Scan on orders o (actual rows=0.04 loops=5000)
                ->  BitmapAnd (actual rows=0.00 loops=5000)
                      ->  Bitmap Index Scan on orders_customer (actual rows=40.00 loops=5000)
                            Index Searches: 5000
                      ->  Bitmap Index Scan on orders_status (actual rows=200.00 loops=5000)
                            Index Searches: 5000
```

The `EXISTS` version collapsed into a single join against the 200 refunded orders:

```
Hash Join (actual rows=5.00 loops=1)
  Hash Cond: (c.id = o.customer_id)
  ->  Seq Scan on customers c (actual rows=5000.00 loops=1)
  ->  Hash (actual rows=5.00 loops=1)
        ->  HashAggregate (actual rows=5.00 loops=1)
              ->  Index Scan using orders_status on orders o (actual rows=200.00 loops=1)
                    Index Searches: 1
```

10,000 index searches against 1. `loops` and `Index Searches` are the two numbers to find first in
any `EXPLAIN ANALYZE` output, because they are where a per-row cost shows up.

The correlated subquery in a select list is the same story with the answer kept rather than tested:

```sql
-- 199 fullscan steps
SELECT c.name,
       (SELECT COUNT(*) FROM orders o
        WHERE o.customer_id = c.id AND o.status = 'completed') AS n
FROM customers c;

-- 9 fullscan steps
SELECT c.name, COUNT(o.id) AS n
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'completed'
GROUP BY c.id;
```

Both return the same 10 rows, including the two customers sitting at 0. The join version's plan is
worth reading, because SQLite went and built an index for the query and threw it away afterwards:

```
|--SCAN c
|--BLOOM FILTER ON o (customer_id=? AND status=?)
`--SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (customer_id=? AND status=?) LEFT-JOIN
```

The `OR` needs indexes to show anything, so this one is Postgres, on the 200,000-row table, with
indexes on `orders(status)`, `orders(customer_id)` and `customers(city)`:

```sql
SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'refunded' OR c.city = 'Porto';
```

```
Hash Join (actual rows=600.00 loops=1)
  Hash Cond: (o.customer_id = c.id)
  Join Filter: ((o.status = 'refunded'::text) OR (c.city = 'Porto'::text))
  Rows Removed by Join Filter: 199400
  ->  Seq Scan on orders o (actual rows=200000.00 loops=1)
  ->  Hash (actual rows=5000.00 loops=1)
        ->  Seq Scan on customers c (actual rows=5000.00 loops=1)
```

Three indexes, none used, and 199,400 joined rows tested and thrown away. Split into two queries and
each branch gets the index that suits it:

```sql
SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status = 'refunded'
UNION
SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.city = 'Porto';
```

```
HashAggregate (actual rows=600.00 loops=1)
  ->  Append (actual rows=600.00 loops=1)
        ->  Hash Join (actual rows=200.00 loops=1)
              ->  Index Scan using orders_status on orders o (actual rows=200.00 loops=1)
                    Index Searches: 1
        ->  Nested Loop (actual rows=400.00 loops=1)
              ->  Index Scan using customers_city on customers c_1 (actual rows=10.00 loops=1)
                    Index Searches: 1
              ->  Bitmap Heap Scan on orders o_1 (actual rows=40.00 loops=10)
                    Index Searches: 10
```

600 rows either way. The second one never reads the 200,000.

`sql-not-exists` and `sql-anti-join` are the same question written two of the three ways, which is
the rep worth doing by hand: ask for the customers who never bought Fantasy with `NOT EXISTS`, then
ask for the books nobody reviewed with a `LEFT JOIN` and `IS NULL`, and notice that the third form,
`NOT IN`, is the one that breaks on a NULL. [Subqueries and CTEs](../sql/subqueries-and-ctes.md) has
why.

## Traps

**The rewrite is right and the plan is unchanged.** SQLite prints the same tree for the `count(*) > 0`
and `EXISTS` versions above, down to labelling both `CORRELATED SCALAR SUBQUERY 1`. Early exit is not
a node, so the tree cannot show it. `.stats on` in the shell and the "Fullscan Steps" line is the
cheapest way to see it on SQLite; on Postgres it is `EXPLAIN ANALYZE`, and the numbers that move are
`loops` and `Index Searches`, not the estimated costs.

**Splitting the `OR` into a `UNION` did nothing.** Both branches on one table with an index each is
already the planner's job, and both engines do it. SQLite reports it in the plan, and its manual
notes the other case too, that an `OR` of equalities on one column is rewritten into an `IN`:

```
-- WHERE status = 'refunded' OR customer_id = 42
`--MULTI-INDEX OR
   |--INDEX 1
   |  `--SEARCH orders USING INDEX orders_status (status=?)
   `--INDEX 2
      `--SEARCH orders USING INDEX orders_customer (customer_id=?)
```

Postgres builds a `BitmapOr` over the same two indexes. Keep the rewrite for the case in the worked
example, where the branches belong to different tables.

**The `UNION` version returns a different number of rows.** `UNION` de-duplicates the whole combined
result, not just the overlap between the branches, so it is only a drop-in replacement when the
select list is unique per row. On a variant of that table where one refunded order belongs to a Porto
customer, selecting `o.id` gives 799 rows from the `OR` and 799 from the `UNION`, but `UNION ALL`
gives 800, because the one order that satisfies both branches is emitted twice. Change the select
list to `c.city` and the divergence is total: the `OR` returns 799 rows and the `UNION` returns 2.
Decide what a row means before picking the operator; [set operations](../sql/set-operations.md) has
the rest of that arithmetic.

**The correlated subquery became a `LEFT JOIN` and the zeros disappeared.** Two separate ways to lose
them, and both are quiet. An `INNER JOIN` drops every customer with no matching order, which takes
that query on `practice.db` from 10 rows to 8. And `COUNT(*)` counts the join row rather than the
match, so a customer with no orders comes back as 1 instead of 0; `COUNT(o.id)` counts non-null
values and returns 0. `SUM` over no matched rows returns NULL rather than 0 and needs a `COALESCE`.
Check the row count and the extreme values against the old query before you check the timing.

**The rewrite worked and the endpoint is still slow.** All three of these change one statement's
plan. None of them touches how many statements the request sends, and a page that runs a query per
row is unaffected by making each of those queries faster. That is [N+1](./n-plus-one.md), and it is
found by counting statements rather than by reading a plan. `slow-list-endpoint-kysely` judges an
endpoint on both at once: every statement it sends is logged with its row count, and one checkpoint
runs `EXPLAIN` on the query it sent and reads the plan back.
