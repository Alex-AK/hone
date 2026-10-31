---
title: Grouping, and what you may select
question: Why does the database refuse to select a column I did not group by?
order: 4
practise:
  - sql-count-genre
  - sql-revenue-by-genre
  - sql-date-month
  - sql-conditional-aggregate
  - sql-case-buckets
  - sql-having-avg
sources:
  - author: SQLite
    title: SELECT
    url: https://www.sqlite.org/lang_select.html
  - author: SQLite
    title: Built-in Aggregate Functions
    url: https://www.sqlite.org/lang_aggfunc.html
  - author: PostgreSQL
    title: SELECT
    url: https://www.postgresql.org/docs/current/sql-select.html
  - author: Markus Winand
    title: The FILTER clause
    url: https://modern-sql.com/feature/filter
verified: 2026-08-01
---

Grouping squeezes many rows into one, like all of a genre's books into a single line with a count.
Anything shown on that line needs one obvious answer for the whole group: the thing you grouped by
has one, and so does a total or an average. A plain column usually doesn't, which is why one
database refuses the query and another quietly picks a row for you.

## The model

`GROUP BY` collapses the input rows into one output row per distinct value of the grouping
expressions. A group is many rows and the result is one row, so every expression in the `SELECT`
list needs an answer that is single by construction. Two kinds are. The expressions you grouped by
are identical for every row in the group, because that is what put those rows in the same group.
Aggregates (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`) are defined over all the rows of a group and return
one value. A third kind, a plain column you did not group by, has as many candidate values as the
group has rows and no rule for choosing between them. That is the thing the database objects to.
Postgres objects with an error; SQLite, which the problems run, accepts it, and the first trap shows
what you get.

Postgres states the rule and its one exception. Referring to ungrouped columns is invalid "except
within aggregate functions or when the ungrouped column is functionally dependent on the grouped
columns", and "a functional dependency exists if the grouped columns (or a subset thereof) are the
primary key of the table containing the ungrouped column". So `GROUP BY b.id` earns you `b.title`
for nothing, which is why grouping by the key and not by the display column is the habit worth
keeping.

Aggregates have opinions about NULL, and they differ from each other:

- `COUNT(*)` counts rows in the group.
- `COUNT(x)` counts the rows where `x` is not NULL.
- `COUNT(DISTINCT x)` counts the distinct non-NULL values.
- `AVG(x)` averages the non-NULL values and divides by how many of those there were, so a missing
  value is not a zero and does not pull the average down.
- `SUM` over a group with no non-NULL input returns NULL rather than 0. SQLite's `TOTAL` returns 0.0
  instead and is SQLite-only.

The `GROUP BY` list takes expressions, not just columns, and that is how time bucketing works. Dates
in this schema are TEXT, so a month is a string projection: `strftime('%Y-%m', ordered_at)` gives
`2023-01`, which sorts chronologically because the widest unit is on the left. Postgres spells the
same projection `date_trunc('month', ordered_at)`. Both engines let `GROUP BY` name a select-list
alias, and Postgres says so explicitly: output columns "can also be referenced (by name or ordinal
number) in the `GROUP BY` clause". Standard SQL does not, so portable code repeats the expression.

When two output columns need different subsets of the same group, the condition goes inside the
aggregate rather than in a `WHERE`:

```sql
SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END)
```

Each aggregate sees every row of the group and counts only the ones it cares about. Always give
`CASE` an `ELSE`, because unmatched rows otherwise produce NULL, which `SUM` skips and which forms a
group of its own if you group by the `CASE`. `FILTER (WHERE ...)` is the standard spelling of the
same idea and both engines here accept it, but Winand's compatibility table is the argument for
`CASE`: it is the form that runs everywhere.

## Worked example

Three counts over the same 32 rows, answering three different questions:

```sql
SELECT COUNT(*) AS reviews,
       COUNT(comment) AS with_comment,
       COUNT(DISTINCT book_id) AS books_reviewed
FROM reviews;
```

```
reviews  with_comment  books_reviewed
32       22            12
```

Now one row per genre, with the completed and cancelled counts side by side:

```sql
SELECT b.genre,
       SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
FROM order_items oi
JOIN books b  ON b.id = oi.book_id
JOIN orders o ON o.id = oi.order_id
GROUP BY b.genre;
```

```
genre    completed  cancelled
Fantasy  11         3
History  6          1
Mystery  9          2
Science  6          2
```

`b.genre` is grouped, so it can be selected. The two `SUM`s are aggregates, so they can be selected.
Nothing else is on the list, and that is the whole rule. Move `o.status = 'completed'` out to a
`WHERE` and the cancelled column reads 0 everywhere, because the rows it needed were gone before
grouping started.

## Traps

**The query runs here and the same query is rejected in production.** SQLite accepts a column that
is neither grouped nor aggregated:

```sql
SELECT genre, title, COUNT(*) AS books FROM books GROUP BY genre;
```

```
genre    title              books
Fantasy  The Glass Kingdom  5
History  Empires of Salt    3
Mystery  A Quiet Alibi      4
Science  The Restless Atom  3
```

Five Fantasy books went in and one title came out, chosen for no reason you can predict. SQLite
calls this a bare column, documents it as an SQLite-specific extension, and is blunt about what you
get: the value comes from "one of the input rows that form the aggregate", the choice can change
between runs, and when the aggregate has no input rows the value can be something "not found
anywhere in the tables of the FROM clause". Postgres raises an error instead. So a query can pass
against the practice database and still be meaningless. Group by the key and select what depends on
it, or put the column inside an aggregate and mean it.

**A `MAX` made the bare column look correct, and it is still not portable.** SQLite has one
documented special case: with exactly one `min()` or `max()` in the query, bare columns take their
values from a row holding that extreme.

```sql
SELECT genre, title, MAX(price) FROM books GROUP BY genre;
```

```
genre    title                MAX(price)
Fantasy  Songs of the Hollow  27.0
```

That really is the priciest Fantasy book, which is exactly why this trap survives review. It holds
only for the built-in `min`/`max`, only when there is one of them, and ties are broken arbitrarily.
Postgres has no equivalent; there you want `DISTINCT ON` or a window function.

**The average came out higher than you expected because the missing rows were skipped.** Three of
the 15 books have no `inventory` row at all, so a `LEFT JOIN` leaves `i.stock` NULL for them:

```sql
SELECT ROUND(AVG(i.stock), 2)              AS skips_nulls,   -- 12.33
       ROUND(AVG(COALESCE(i.stock, 0)), 2) AS counts_as_zero -- 9.87
FROM books b LEFT JOIN inventory i ON i.book_id = b.id;
```

Both divide the same total of 148, one by the 12 books with a stock row and one by all 15. Neither
is wrong, but only one of them answers "average stock per book". `COUNT` splits the same way here:
`COUNT(*)` is 15 and `COUNT(i.stock)` is 12. See [NULL is not a value](./null-is-not-a-value.md) for
why the missing rows behave like that.

**`COUNT(*)` counted join rows rather than the things you were counting.** Join `customers` to
`orders` to `order_items` and one order contributes one row per line item, so Dana Whitfield's group
holds 6 rows for 3 orders. `COUNT(*)` says 6 and `COUNT(DISTINCT o.id)` says 3. Whenever a join can
multiply rows before the grouping, `COUNT(*)` is counting the multiplication, and
[what a join does](./what-a-join-does.md) is the page about why.
