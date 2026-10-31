---
title: Subqueries and CTEs
question: Should this be a subquery, a CTE or a join, and does the database care?
order: 6
practise:
  - sql-in-subquery
  - sql-subquery-above-avg
  - sql-cte-first-order
  - sql-not-exists
  - sql-recursive-hierarchy
  - sql-repeat-customers
sources:
  - author: SQLite
    title: The WITH Clause
    url: https://www.sqlite.org/lang_with.html
  - author: SQLite
    title: SQL Language Expressions
    url: https://www.sqlite.org/lang_expr.html
  - author: SQLite
    title: Row Values
    url: https://www.sqlite.org/rowvalue.html
  - author: PostgreSQL
    title: WITH Queries (Common Table Expressions)
    url: https://www.postgresql.org/docs/current/queries-with.html
  - author: PostgreSQL
    title: Subquery Expressions
    url: https://www.postgresql.org/docs/current/functions-subquery.html
  - author: PostgreSQL
    title: PostgreSQL 12 Release Notes
    url: https://www.postgresql.org/docs/release/12.0/
  - author: Markus Winand
    title: with — Organize Complex Queries
    url: https://modern-sql.com/feature/with
verified: 2026-08-01
---

Sometimes a query needs another query's answer first, like the average price before you can find the
books above it. You can nest one query inside another, or name it at the top and use it below. The
shapes don't always return the same rows, and whether they run differently depends on the database.

## The model

**Pick the shape for the rows it returns, then read the plan for what it costs, because the cost
depends on the engine.** The engine here is SQLite, which the SQL problems run against: plans and
row counts come from the seeded `practice.db` on SQLite 3.53.2. Postgres differs in two places, and
both are marked.

A subquery is a `SELECT` inside another statement. A **scalar** one returns one row and one column,
so it goes anywhere a value goes. `WHERE price > AVG(price)` is rejected because `WHERE` runs before
aggregation, but `WHERE price > (SELECT AVG(price) FROM books)` compares against a number like any
other. A **list** subquery returns one column and feeds `IN`, and a **table** subquery sits in
`FROM`.

**What decides how a subquery runs is whether it mentions the outer row.** An uncorrelated subquery
could be computed once, up front. A correlated one reads a column from the outer query, so
conceptually it runs once per outer row, and SQLite's plan names it:

```
-- SELECT title FROM books WHERE price > (SELECT avg(price) FROM books);
SCAN books
SCALAR SUBQUERY 1

-- SELECT b.title, (SELECT avg(price) FROM books g WHERE g.genre = b.genre) FROM books b;
SCAN b
CORRELATED SCALAR SUBQUERY 1
```

A planner is free to rewrite a correlated subquery as a join and often does. When it can't, you pay
for every row.

**A join, `EXISTS` and `IN` can ask the same question and return different rows.** A join returns
one row per match, which is [what a join does](./what-a-join-does.md). `EXISTS` keeps or drops each
outer row and never duplicates it, and the Postgres docs say it generally stops at the first row it
finds. `IN` matches the join on a single column, and `NOT IN` breaks the moment the subquery returns
a NULL.

### WITH, and whether it is a fence

A CTE is a name for a subquery, written above the query that uses it. The rows don't change: the
query reads top to bottom instead of inside out, and the name can be referenced more than once.
Whether it also blocks optimisation depends on the engine and the version:

- **Postgres 11 and earlier** never inlined, and the optimizer was less able to push the parent's
  filters into a CTE than into a subquery.
- **Postgres 12 and later** inline by default. From the release notes: "CTEs are automatically
  inlined if they have no side-effects, are not recursive, and are referenced only once in the
  query." `MATERIALIZED` forces the old behaviour back, and `NOT MATERIALIZED` forces inlining even
  where the CTE is referenced several times.
- **SQLite** publishes no rule. It picks whatever strategy it thinks best, and its manual asks you
  not to use either keyword (available from 3.35.0) without a compelling reason.

Left alone, SQLite pushed the outer filter into the CTE and used the primary key; told to
materialise, it built the ephemeral table first and scanned it:

```
-- WITH cheap AS (SELECT id, title FROM books WHERE price < 20)
-- SELECT * FROM cheap WHERE id = 3;
SEARCH books USING INTEGER PRIMARY KEY (rowid=?)

-- WITH cheap AS MATERIALIZED (SELECT id, title FROM books WHERE price < 20)
-- SELECT * FROM cheap WHERE id = 3;
MATERIALIZE cheap
SCAN books
SCAN cheap
```

So read the plan on the engine you are running, and don't port the conclusion.

## Worked example

Which customers placed more than one completed order? That is `sql-repeat-customers`, here in three
shapes that all return the same 6 rows. First, a table subquery in `FROM`:

```sql
SELECT c.name, t.order_count
FROM (
  SELECT customer_id, COUNT(*) AS order_count
  FROM orders
  WHERE status = 'completed'
  GROUP BY customer_id
) AS t
JOIN customers c ON c.id = t.customer_id
WHERE t.order_count > 1;
```

A correlated scalar subquery reads `c.id` from the row being tested. Writing it twice, once to
filter and once to display, is the tell:

```sql
SELECT
  c.name,
  (SELECT COUNT(*) FROM orders o
    WHERE o.customer_id = c.id AND o.status = 'completed') AS order_count
FROM customers c
WHERE (SELECT COUNT(*) FROM orders o
        WHERE o.customer_id = c.id AND o.status = 'completed') > 1;
```

The CTE is the first version with the subquery lifted out and named:

```sql
WITH completed_counts AS (
  SELECT customer_id, COUNT(*) AS order_count
  FROM orders
  WHERE status = 'completed'
  GROUP BY customer_id
)
SELECT c.name, cc.order_count
FROM completed_counts cc
JOIN customers c ON c.id = cc.customer_id
WHERE cc.order_count > 1;
```

The answer the problem grades is shorter than all three: a plain join with `HAVING COUNT(*) > 1`.
Reach for a subquery when an aggregate has to be compared against something computed at a different
grain, which is where `sql-cte-first-order` lands.

Recursion is the one job no subquery can do, and it is `sql-recursive-hierarchy`:

```sql
WITH RECURSIVE chart AS (
  SELECT id, name, 0 AS depth
  FROM employees
  WHERE manager_id IS NULL -- anchor: the rows with no parent
  UNION ALL
  SELECT e.id, e.name, chart.depth + 1
  FROM employees e
  JOIN chart ON e.manager_id = chart.id -- step: joins onto the previous round
)
SELECT name, depth FROM chart;
```

The anchor seeds the result with the CEO. Each round joins in the employees whose `manager_id`
turned up in the round before, and it stops when a round adds nothing.

## Traps

**One statement, and it slows down in a straight line as the table grows.** A correlated subquery in
the select list runs per output row, so a report over 10,000 customers can run 10,000 inner queries
inside one statement. It is [N+1](../databases/n-plus-one.md) inside the database, invisible to
anything that counts statements, and the plan shows it as `CORRELATED SCALAR SUBQUERY`. A
`LEFT JOIN` with `GROUP BY`, or a window function, computes the column once.

**An anti-join returns zero rows and raises nothing.**
`WHERE id NOT IN (SELECT manager_id FROM employees)` comes back empty because one `manager_id` is
NULL, and `NOT IN` expands to an `AND` chain of inequalities that can never be true. The
`NOT EXISTS` form returns the 9 rows you wanted, which is `sql-not-exists`, and [NULL is not a
value](./null-is-not-a-value.md) has the truth table. Treat `NOT IN` over a nullable column as a bug
until proven otherwise.

**The row count jumped when you rewrote EXISTS as a join.** A join to a child table emits one row
per match, so 8 customers who bought Fantasy came back as 14 rows. `DISTINCT` fixes the count and
hides the reason. `EXISTS` asks which rows qualify, and returns each one once.

**A recursive CTE never returns.** A cycle in the data, like two employees managing each other, lets
the step keep producing rows it has already produced. SQLite's documented answer, used in its own
graph example, is `UNION` instead of `UNION ALL`. A depth column with `WHERE depth < 20` is the
cruder guard. The anchor has to select the roots and only the roots, or every row seeds its own
traversal and you get the tree back once per node.

**The same query parses in one engine and not the other.** SQLite accepts `FROM (SELECT …)` with no
alias. Postgres accepts it from version 16 and rejected it before that. Name the subquery anyway:
you need the name to qualify a column the moment a second table joins.
