---
title: NULL is not a value
question: Why did my WHERE clause drop the rows I was looking for?
order: 3
practise:
  - sql-null-check
  - sql-coalesce-stock
  - sql-not-exists
  - sql-anti-join
  - logic-sql-not-in-null
  - logic-sql-not-equal-drops-null
sources:
  - author: SQLite
    title: NULL Handling in SQLite Versus Other Database Engines
    url: https://www.sqlite.org/nulls.html
  - author: SQLite
    title: Built-in Aggregate Functions
    url: https://www.sqlite.org/lang_aggfunc.html
  - author: SQLite
    title: Datatypes In SQLite
    url: https://www.sqlite.org/datatype3.html
  - author: SQLite
    title: Release 3.30.0
    url: https://www.sqlite.org/releaselog/3_30_0.html
  - author: PostgreSQL
    title: Logical Operators
    url: https://www.postgresql.org/docs/current/functions-logical.html
  - author: PostgreSQL
    title: Sorting Rows
    url: https://www.postgresql.org/docs/current/queries-order.html
  - author: PostgreSQL
    title: Constraints
    url: https://www.postgresql.org/docs/current/ddl-constraints.html
  - author: Markus Winand
    title: Three-Valued Logic (3VL)
    url: https://modern-sql.com/concept/three-valued-logic
verified: 2026-08-01
---

Databases have a marker for a value that is missing or not known. It behaves unlike any real value:
comparing it with anything, even another missing value, gives neither yes nor no. Filters keep only
the rows that come out yes, so missing values make rows vanish from a result without any error.

## The model

`NULL` means unknown. Not zero, not the empty string, not "no rows": unknown. Every other rule on
this page falls out of reading it that way.

Compare anything against an unknown and the answer is also unknown. `salary > 100000` is unknown
when `salary` is NULL, because nothing about a value you don't know settles the question. So SQL
carries three truth values instead of two, and `WHERE` keeps only the rows whose condition came out
**true**. False and unknown are discarded together, which is why a NULL bug removes rows instead of
raising an error.

The truth tables are the whole language, and Postgres documents them plainly:

| `a`     | `b`     | `a AND b` | `a OR b` |
| ------- | ------- | --------- | -------- |
| true    | true    | true      | true     |
| true    | false   | false     | true     |
| true    | unknown | unknown   | true     |
| false   | false   | false     | false    |
| false   | unknown | false     | unknown  |
| unknown | unknown | unknown   | unknown  |

`NOT unknown` is unknown, so you can't negate your way to an answer. Two rows in that table are the
escape hatches: `false AND unknown` is false, and `true OR unknown` is true. Everywhere else the
unknown wins and takes the row with it.

`IS NULL` and `IS NOT NULL` are the only comparisons that ask about NULL-ness and come back with a
real true or false. `= NULL`, `!= NULL` and `<> NULL` are unknown whatever sits on the other side.
Two NULLs aren't equal to each other either, because neither one is known.

`COALESCE(a, b, …)` returns its first non-NULL argument, which is how you supply a default. It
matters for arithmetic as much as for display: `stock - 1` is NULL when `stock` is NULL, so one
missing value quietly poisons an entire expression. SQLite's `IFNULL(x, 0)` is the two-argument
version of the same thing; `COALESCE` is the portable one.

Aggregates skip NULLs rather than choking on them. `COUNT(*)` counts rows. `COUNT(column)` counts
the rows where that column is not NULL, so the two differ by exactly the number of NULLs. `AVG`
divides by the count of non-NULL values, which means a missing value is not a zero, it is absent
from both the sum and the divisor, and that changes the number you get.

Sorting has to put NULLs somewhere, and this is where the engines part. SQLite treats NULL as less
than every other value, so it sorts first ascending and last descending. Postgres treats it as
larger than every non-null value, so `NULLS LAST` is the default for `ASC` and `NULLS FIRST` for
`DESC`. Both accept an explicit `NULLS FIRST` or `NULLS LAST` (SQLite since 3.30.0, released in
2019), and writing it out is the only way the query means the same thing on both.

A `UNIQUE` column takes as many NULLs as you like, in SQLite and in Postgres, because two unknowns
aren't equal and so can't collide. Postgres can opt out with `UNIQUE NULLS NOT DISTINCT`.
`DISTINCT` and `GROUP BY` go the other way and treat NULLs as one another's equals, collapsing them
into a single row.

## Worked example

The results here are SQLite, which the SQL problems run; Postgres differs only in where NULLs sort.
`employees.manager_id` is NULL for exactly one row, the person at the top. Ask which employees
manage nobody:

```sql
-- 0 rows, and no error.
SELECT name
FROM employees
WHERE id NOT IN (SELECT manager_id FROM employees);

-- 9 rows.
SELECT e.name
FROM employees e
WHERE NOT EXISTS (SELECT 1 FROM employees m WHERE m.manager_id = e.id);
```

The subquery returns 12 values and one of them is NULL. `NOT IN` is a chain of inequalities joined
by `AND`: `id != 2 AND id != 3 AND … AND id != NULL`. That last term is unknown for every row, and
by the truth table an `AND` containing an unknown is either false or unknown. Never true. So `WHERE`
keeps nothing at all, out of a table with 12 rows.

`NOT EXISTS` asks a question that has an answer: did the correlated subquery produce a row? Yes or
no, whatever the data holds.

## Traps

**An anti-join comes back empty, with no error.** The query used `NOT IN` over a subquery whose
column is nullable. A single NULL in those results makes the predicate unknown for every row, and
zero rows is what an unknown `WHERE` returns. Reach for `NOT EXISTS`, or the LEFT JOIN form with
`WHERE right_table.id IS NULL`. Plain `IN` survives the same NULL, because one genuine match still
produces a true and true wins the `OR` chain.

**A filter matches nothing when you can see the rows in the table.** `WHERE comment = NULL` returns
0 rows against `reviews`, where 10 of the 32 comments really are NULL. It is unknown for the NULL
rows too, so there is no value of `comment` that makes it true. `IS NULL` is the test. The mirror
image is `!=`: `WHERE comment != 'x'` returns 22 rows, not 32, because a NULL comment answers
"unknown", not "yes, different".

**The count is smaller than the number of rows.** `COUNT(comment)` on `reviews` is 22 while
`COUNT(*)` is 32. Both are right, and they answer different questions: how many rows, against how
many rows have a comment. Pick deliberately, and after a LEFT JOIN pick `COUNT(right_table.id)`, so
an unmatched row counts as 0 rather than 1.

**The average changes when you fill in the missing rows.** Three of the 15 books have no `inventory`
row, so `AVG(i.stock)` over the LEFT JOIN is 148/12, or 12.33. Wrap it as
`AVG(COALESCE(i.stock, 0))` and it becomes 148/15, or 9.87. Skipping a book and treating it as out
of stock are different claims, and the query has to decide which one it is making.

**A join drops rows that are plainly in both tables.** Joining `employees` to itself on
`a.manager_id = b.manager_id AND a.id < b.id` to pair up peers gives 17 pairs and never once
mentions the CEO, whose `manager_id` is NULL. NULL doesn't equal NULL, so a join key that can be
NULL loses those rows silently. See [what a join does](./what-a-join-does.md) for the row-count
side of this.
