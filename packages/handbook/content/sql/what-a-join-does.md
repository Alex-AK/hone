---
title: What a join actually does
question: Why did joining one table to another multiply my rows?
order: 2
practise:
  - sql-join-author-name
  - sql-orders-per-customer
  - sql-anti-join
  - sql-self-join
  - sql-direct-reports
  - sql-order-totals
  - sql-not-exists
  - sql-read-join-condition
sources:
  - author: PostgreSQL
    title: Table Expressions
    url: https://www.postgresql.org/docs/current/queries-table-expressions.html
  - author: SQLite
    title: 'SQLite Query Language: SELECT'
    url: https://www.sqlite.org/lang_select.html
  - author: SQLite
    title: Release 3.39.0 On 2022-06-25
    url: https://www.sqlite.org/releaselog/3_39_0.html
  - author: Markus Winand
    title: NULL
    url: https://modern-sql.com/concept/null
verified: 2026-08-03
---

Every query and every number on this page was run against Hone's practice database, which is
SQLite. Join semantics are the same in Postgres, and the one difference that matters here is called
out below.

## The model

A join produces pairs. For each row on the left, the result gets one row for every row on the right
that satisfies the condition. Postgres states it directly: "For each row R1 of T1, the joined table
has a row for each row in T2 that satisfies the join condition with R1." SQLite describes the same
thing from the other end. Every join starts as the cartesian product of the two sides, and the `ON`
expression is a filter over that product: "Only rows for which the expression evaluates to true are
included." `CROSS JOIN` is that product with the filter left off, so 10 customers and 20 orders give
200 rows. Postgres lists its other two spellings, `FROM T1 INNER JOIN T2 ON TRUE` and the comma form
`FROM T1, T2`, as equivalent to it.

So the row count you get back is the number of matching pairs, not the number of rows in the table
you started from. A customer with three orders is three rows. An order with three line items is
three rows. Nothing has misfired; that is the join doing its one job, and it is why a duplicated
name, an inflated `SUM` and a `COUNT` that is too big all turn out to be the same bug.

`INNER JOIN` stops there, so a left row that matches nothing contributes nothing. `LEFT JOIN` puts
it back. After the `ON` filter has run, SQLite adds "an extra row ... for each row in the original
left-hand input dataset that does not match any row in the right-hand dataset", carrying NULL in
every right-hand column. Those NULL-padded rows are the entire difference between the two joins, and
they are fragile: a `WHERE` test on a right-hand column throws them straight back out, because a
comparison against NULL is not true. `IS NULL` is the exception, and that exception is the
anti-join.

A self-join is the same rule with one table listed twice under different names.
`employees.manager_id` points back at `employees`:

```sql
SELECT e.name, m.name AS manager_name
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id;
```

The aliases are load-bearing, not tidiness: without them `name` is ambiguous. So is `LEFT`. The
CEO's `manager_id` is NULL, so an inner join here returns 11 rows for 12 employees. Swap which alias
you group by and the question flips from "who is my manager" to "who reports to me", which is
`sql-direct-reports`.

An anti-join asks for the rows with no match. It has two spellings, and they return the same three
never-reviewed books here:

```sql
SELECT b.title FROM books b
LEFT JOIN reviews r ON r.book_id = b.id
WHERE r.id IS NULL;

SELECT b.title FROM books b
WHERE NOT EXISTS (SELECT 1 FROM reviews r WHERE r.book_id = b.id);
```

The first builds every pair and then keeps the rows where the padding shows through, which is why
the tested column has to be one that is never NULL in a real row: use the primary key. The second
builds no pairs at all. It asks whether any row exists and stops at the first one, which is why the
select list is `1`. Reach for `NOT EXISTS` when the right-hand table contributes no columns to the
output, which is most of the time.

One engine difference. SQLite gained `RIGHT JOIN` and `FULL OUTER JOIN` in release 3.39.0 on
2022-06-25, and both run in the version Hone ships. Postgres has all three. If older SQLite code
writes every outer join as a `LEFT JOIN` with the tables the other way round, that gap is why.

## Worked example

Two orders in, five rows out:

```sql
SELECT o.id AS order_id, oi.book_id, oi.quantity
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.id IN (1, 3);
```

```
order_id  book_id  quantity
1         1        1
1         6        1
3         4        1
3         13       1
3         7        3
```

Order 1 has two line items and order 3 has three, so the two rows on the left come back as 2 + 3.
Aggregate over exactly those five rows and you get three different numbers, all of them correct
answers to different questions:

```sql
COUNT(*)              -- 5, the line items
COUNT(DISTINCT o.id)  -- 2, the orders
SUM(oi.quantity)      -- 7, the copies
```

`GROUP BY` is what collapses the fan back down. This is `sql-order-totals`, one row per order again:

```sql
SELECT o.id, SUM(oi.quantity * oi.unit_price) AS total
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status = 'completed'
GROUP BY o.id
ORDER BY total DESC;
```

`status` lives on `orders`, the left table of an inner join, so filtering it in `WHERE` is safe
here. The next section is about where it is not.

## Traps

**A customer with no completed orders vanished from the report.** The `LEFT JOIN` is still in the
source and it stopped behaving like one, because a condition on the right-hand table went into
`WHERE` instead of `ON`. On the practice database,
`LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'completed'` returns all ten customers,
two of them with a count of 0. Move that `AND` down into a `WHERE` clause and it returns eight: the
padded rows hold NULL in `o.status`, and SQLite excludes a row whose `WHERE` clause "evaluates to
either false or NULL". Postgres gives the rule to remember: a restriction in `ON` is processed
before the join and one in `WHERE` after it, and "that does not matter with inner joins, but it
matters a lot with outer joins". Any `WHERE` test on a right-hand column except `IS NULL` deletes
the rows the `LEFT` was for.

**The total is too high and nobody can say by how much.** Summing a column that belongs to the left
table across a one-to-many join adds it once per match. The Glass Kingdom costs 18.99 and appears on
four order lines, so `SUM(b.price)` over `books JOIN order_items` contributes 75.96 for that single
book. Sum a column the many side owns instead (`SUM(oi.quantity * oi.unit_price)`), or aggregate the
many side in a subquery first and join to the one row that comes back.

**`COUNT(*)` counted line items when you asked for customers.** `COUNT(DISTINCT c.id)` returns the
right number, and it is also a diagnosis: needing to de-duplicate the table you started from means
the join was there to test whether something existed, not to contribute columns. `EXISTS` and `IN`
test existence without fanning the rows out at all. `sql-not-exists` is that query written the way
it should have been the first time.

**The CEO is missing from the org chart.** `employees.manager_id` is nullable, and `NULL = NULL` is
not true, so an inner self-join on it drops the one employee who has no manager: 11 rows for 12
people. `LEFT JOIN` keeps them, with `manager_name` NULL. Every join on a nullable column has this
shape, including any optional foreign key, and the rest of the rules are on
[NULL](./null-is-not-a-value.md).

**`NOT IN` came back empty, with no error.** Asking which employees manage nobody with
`WHERE id NOT IN (SELECT manager_id FROM employees)` returns zero rows here. One employee has a NULL
`manager_id`, and Winand's rule explains the rest: comparisons to NULL are "neither true nor false
but instead return the third logical value of SQL: unknown", so once a NULL is in the list `NOT IN`
can never be true for anybody. The `NOT EXISTS` form of the same question returns all 9 of them.
