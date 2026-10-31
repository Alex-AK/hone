---
title: Set operations and de-duplication
question: UNION or UNION ALL, and is DISTINCT the same as grouping?
order: 8
practise:
  - sql-union-cities
  - sql-distinct-cities
  - sql-dedupe-keep-latest
sources:
  - author: PostgreSQL
    title: Combining Queries (UNION, INTERSECT, EXCEPT)
    url: https://www.postgresql.org/docs/current/queries-union.html
  - author: PostgreSQL
    title: SELECT
    url: https://www.postgresql.org/docs/current/sql-select.html
  - author: SQLite
    title: The SELECT statement
    url: https://www.sqlite.org/lang_select.html
verified: 2026-08-01
---

Customer cities and staff cities live in different tables, and you can still ask for them as one
list. Stacking two results, keeping only what both share, or taking one away from the other are all
built in. Whether duplicates get removed is the part that bites: pick wrong and you either pay for a
sort you didn't need or silently lose a row you meant to keep.

## The model

A join adds columns. A set operator adds rows. `UNION` stacks two result sets and then removes
duplicates from the combined result; `UNION ALL` stacks them and stops. That one word is the whole
difference, and it is not free. Postgres describes `UNION` as eliminating duplicate rows in the same
way as `DISTINCT`, and finding duplicates means sorting or hashing everything first. SQLite's plan
says it out loud:

```
`--COMPOUND QUERY
   |--LEFT-MOST SUBQUERY
   |  `--SCAN customers
   `--UNION USING TEMP B-TREE
      `--SCAN employees
```

The `UNION ALL` version of the same query has no temp B-tree in its plan. So when the two sides
cannot overlap, or when the duplicates are the point, `UNION ALL` is the operator you wanted and
`UNION` is a sort you are paying for by accident.

The branches have to be compatible: the same number of columns, with types the engine can reconcile.
Column names come from the first branch, so aliasing the second one changes nothing. SQLite refuses
a count mismatch outright, telling you the two SELECTs do not have the same number of result
columns, but its loose typing will happily stack a text column onto an integer one and hand back
both. Postgres will not: it requires the corresponding columns to have compatible types.

`INTERSECT` keeps rows found in both sides. `EXCEPT` keeps rows in the left side that are not in the
right. Both de-duplicate as well. Postgres has `INTERSECT ALL` and `EXCEPT ALL`, which keep the
duplicates; SQLite has neither, and `EXCEPT ALL` there is a syntax error.

`ORDER BY` goes once, at the end, and sorts the whole compound. It is not a way to order one branch:
SQLite answers `ORDER BY clause should come after UNION not before`. Postgres reads a trailing
`LIMIT` the same way, as applying to the set operation rather than to its last input, so a branch
that needs its own `ORDER BY` or `LIMIT` has to be wrapped in parentheses.

De-duplication is a separate question, and three tools answer overlapping parts of it:

- `DISTINCT` — collapse identical rows. It compares the entire select list, never one column of it.
- `GROUP BY` — collapse the rows that agree on the columns you name, so an aggregate can sit beside
  them. Reach for it the moment you want a count or a sum next to the values.
- `ROW_NUMBER() OVER (PARTITION BY key ORDER BY …)`, filtered to `= 1` — keep one whole row per key,
  picked by a rule you write. It is the only one of the three that answers "the latest review of
  each book", because the other two discard the columns you did not name. See
  [window functions](./window-functions.md).

## Worked example

Every count here came from the practice database on SQLite 3.51. Ten customers and twelve
employees, and the cities they live in:

```sql
SELECT city FROM customers UNION ALL SELECT city FROM employees;  -- 22 rows
SELECT city FROM customers UNION     SELECT city FROM employees;  -- 11 rows
```

22 is 10 + 12, every row of both tables. 11 is the number of distinct cities across the pair, and it
is arithmetic you can check: the customers live in 9 distinct cities, the employees in 9, and 7 of
those are shared.

```sql
SELECT city FROM customers INTERSECT SELECT city FROM employees ORDER BY city;
-- Accra, Bristol, Hamburg, Leeds, Lyon, Malmo, Prague

SELECT city FROM customers EXCEPT SELECT city FROM employees ORDER BY city;
-- Porto, Vienna
```

Seven cities have both a customer and an employee; two have a customer and no employee. 9 + 9 - 7 is
the 11 that `UNION` returned.

`DISTINCT` does the same de-duplication inside a single query, and the select list is what it
compares:

```sql
SELECT DISTINCT city FROM customers;        -- 9 rows
SELECT DISTINCT city, name FROM customers;  -- 10 rows, which is the whole table
```

Adding `name` narrowed nothing. Every customer has a different name, so every pair was already
unique and `DISTINCT` had nothing to remove.

## Traps

**A row you knew was there is missing from the result.** Two rows that match on every selected
column are duplicates, and `UNION` drops one of them without a word, because that is what you asked
for. Stack two months of order rows and any pair that agrees on all the columns you selected
collapses into one. When the branches carry records, write `UNION ALL`. Save `UNION` for when the
result is genuinely a set, like a list of cities.

**`SELECT DISTINCT city, name` returned every row.** `DISTINCT` is not a function attached to the
column beside it. It applies to the whole select list, so one extra column that varies per row
defeats it completely, and this is the most common misreading of the keyword. If you want distinct
cities plus something about each city, that something has to be an aggregate, and the query is a
`GROUP BY city`.

**`EXCEPT` and `NOT EXISTS` disagreed on the row count.** Books that have been ordered but never
reviewed, asked two ways:

```sql
SELECT book_id FROM order_items
EXCEPT
SELECT book_id FROM reviews;                          -- 3 rows

SELECT oi.book_id
FROM order_items oi
WHERE NOT EXISTS (SELECT 1 FROM reviews r WHERE r.book_id = oi.book_id);  -- 6 rows
```

Both find the same three books. `EXCEPT` de-duplicates its output, so each book appears once. The
anti-join filters line items and keeps every one that survives, and each of those three books sits
on two order lines. Neither answer is wrong, but only one of them counts order lines, so decide
which grain you are counting before you pick the operator. Postgres `EXCEPT ALL` is a third answer
again, a multiset difference that matches neither count.

**A branch needed a `NULL AS rating` column to line up.** That is the sign the query wanted a join
rather than a set operator: joins widen rows, set operators stack them. The mistake runs the other
way too, and more quietly, because joining two tables to collect their cities multiplies rows
instead of appending them and the result looks plausible until you count it.
[What a join does](./what-a-join-does.md) covers that row-count arithmetic.
