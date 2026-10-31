---
title: WHERE, HAVING, and when each one runs
question: When do I filter with WHERE and when do I have to use HAVING?
order: 5
practise:
  - sql-having-count-genres
  - sql-having-avg
  - sql-repeat-customers
  - sql-subquery-above-avg
sources:
  - author: PostgreSQL
    title: SELECT
    url: https://www.postgresql.org/docs/current/sql-select.html
  - author: PostgreSQL
    title: Table Expressions
    url: https://www.postgresql.org/docs/current/queries-table-expressions.html
  - author: PostgreSQL
    title: Planner/Optimizer
    url: https://www.postgresql.org/docs/current/planner-optimizer.html
  - author: SQLite
    title: SELECT
    url: https://www.sqlite.org/lang_select.html
verified: 2026-08-01
---

Filtering can happen twice in one query: once on individual rows, and again after the rows have been
gathered into groups and counted or totalled. The two filters run at different moments, so a
condition on a count only makes sense in the later one. Put a plain row condition in the wrong place
and some databases run it anyway, with totals that come out wrong.

## The model

A query is defined as a pipeline, and its clauses take effect in a fixed order no matter what order
you typed them in:

```
FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT
```

Postgres documents that list in full, with `WITH` at the front and `DISTINCT`, the set operators and
row locking slotted in. Two adjacent steps decide this page. `WHERE` runs before grouping, so no
group exists yet. An aggregate is a function of a group, so in `WHERE` there is nothing for it to be
a function of, and SQLite says as much: `misuse of aggregate: COUNT()`. `HAVING` runs after
grouping, where each group is one thing with its aggregates already computed, so a condition on
`COUNT(*)` or `AVG(rating)` belongs there and nowhere else. `WHERE` filters rows; `HAVING` filters
groups. What you may then select from a group is [grouping](./grouping.md)'s subject.

Alias visibility falls out of the same list. The `SELECT` list is computed after `HAVING`, so a name
you invent there does not exist yet when `WHERE` runs. Postgres puts it plainly: an output column's
name "can be used to refer to the column's value in `ORDER BY` and `GROUP BY` clauses, but not in
the `WHERE` or `HAVING` clauses; there you must write out the expression instead". `ORDER BY` comes
after the select list, which is why sorting by `revenue DESC` works. `GROUP BY` is the documented
exception that runs earlier and can still see output names.

`HAVING` without a `GROUP BY` is legal and means something specific. Its presence turns the query
into a grouped query, all the selected rows form one group, and you get a single row if the
condition is true and zero rows if it is not. On SQLite 3.51.0,
`SELECT COUNT(*) FROM books HAVING COUNT(*) > 1000` returns nothing at all; drop the threshold to 1
and the same query returns 15.

**Logical order is not execution order.** The list above says what a query means, not how it runs. A
planner will "examine each of these possible execution plans, ultimately selecting the execution
plan that is expected to run the fastest", and every one of those plans produces the same rows, so
it reorders whatever it likes. Do not use this page to reason about cost: put the filter where it
belongs semantically, then read the plan. That half lives in
[reading a query plan](../databases/reading-explain.md) and
[how an index gets used](../databases/how-an-index-gets-used.md).

## Worked example

The output here is SQLite's, which the problems run. Customers with more than one completed order.
Both filters are present, doing different jobs:

```sql
SELECT c.name, COUNT(*) AS order_count
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'completed'
GROUP BY c.id, c.name
HAVING COUNT(*) > 1;
```

```
name            order_count
Dana Whitfield  3
Priya Nair      2
Jonas Meyer     2
Ruth Adeyemi    2
Sam Okafor      2
Ines Duarte     2
```

`WHERE` drops the cancelled orders while they are still individual rows. `GROUP BY` then builds one
group per customer out of what survived, `HAVING` discards the groups of one, and `SELECT` runs
last, on the groups that are left.

Move the row filter into `HAVING` and SQLite runs it without complaint, which is the problem:

```sql
GROUP BY c.id, c.name
HAVING o.status = 'completed' AND COUNT(*) > 1;
```

```
name            order_count
Dana Whitfield  3
Omar Haddad     2
Priya Nair      3
...
```

Priya Nair placed two completed orders and one cancelled one, and her count now reads 3, because the
cancelled row was never removed and `COUNT(*)` counts everything in the group. Omar Haddad, who
placed one of each, is in the output at all only because `o.status` is not a grouped column: SQLite
evaluates a non-aggregate `HAVING` "with respect to an arbitrarily selected row from the group", so
which groups survive is a coin toss. Postgres rejects the query outright, since `HAVING` may refer
"both to grouped expressions and to ungrouped expressions (which necessarily involve an aggregate
function)".

## Traps

**`WHERE COUNT(*) > 1` will not run.** SQLite reports `misuse of aggregate: COUNT()` and points at
the `WHERE`. It is not a syntax quibble you can work around: at that point in the pipeline there is
no group to count. The same applies to `WHERE price > AVG(price)`. Filtering on an aggregate of the
rows you are grouping means `HAVING`; comparing against an aggregate of some other set means a
scalar subquery, `WHERE price > (SELECT AVG(price) FROM books)`, which is a complete query of its
own and so returns a single value that a row can be compared with.

**The alias worked locally and Postgres rejected it.** `SELECT price * 2 AS double_price FROM books
WHERE double_price > 60` returns rows on SQLite 3.51.0. It is an extension, not portable, and
Postgres will not resolve an output name in `WHERE` or `HAVING`. Repeat the expression in the
`WHERE`, or wrap the projection in a subquery or CTE and filter outside it.

**A query with a `HAVING` and no `GROUP BY` came back empty.** That is not "no rows matched". The
whole result was treated as one group, the condition was false for it, and a false condition emits
zero rows where you were expecting a count of 0. If you wanted a per-row filter, you wanted `WHERE`.

**A condition that only needs one row is sitting in `HAVING`.** When the column is grouped, both
engines accept it and the answer is right; it just grouped a pile of rows that were always going to
be thrown away. When the column is not grouped, you get the arbitrary-row behaviour from the worked
example on SQLite and an error on Postgres. The test is quick: if the condition can be decided by
looking at a single row, it belongs in `WHERE`, and anything mentioning an aggregate belongs in
`HAVING`.
