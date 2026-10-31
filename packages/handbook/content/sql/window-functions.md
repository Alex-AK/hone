---
title: Window functions
question: How do I rank rows, or add a running total, without collapsing them into groups?
order: 7
practise:
  - sql-window-row-number
  - sql-window-rank
  - sql-running-total
  - sql-percent-of-total
  - sql-dedupe-keep-latest
sources:
  - author: SQLite
    title: Window Functions
    url: https://www.sqlite.org/windowfunctions.html
  - author: PostgreSQL
    title: Window Functions
    url: https://www.postgresql.org/docs/current/tutorial-window.html
  - author: Markus Winand
    title: over(… order by …)
    url: https://modern-sql.com/caniuse/over_order_by
  - author: PostgreSQL
    title: SELECT
    url: https://www.postgresql.org/docs/current/sql-select.html
verified: 2026-08-01
---

Sometimes you want a figure that depends on other rows, like a rank, a running total or a share of
the whole, without losing the rows. Grouping squashes each group into one row. A window function
keeps every row, and most of its surprises come from how much of the table each row can see.

## The model

**A window function computes over a set of other rows and leaves the current row standing, so you
keep the summary and the detail.** `GROUP BY` makes the opposite trade: twelve reviewed books become
four genre rows and the titles are gone.

`OVER` defines that set. SQLite allows window functions only in the result set and in the `ORDER BY`
of a `SELECT`. They run after `WHERE`, `GROUP BY` and `HAVING` have already decided which rows
exist, which is the same processing order that [WHERE against HAVING](./where-and-having.md) is
about.

Three things go inside `OVER`, all optional:

- `PARTITION BY genre` — group by, without the collapsing. The calculation restarts for each genre
  and every row survives.
- `ORDER BY avg_rating DESC` — puts the partition in a sequence, which is what makes "first" and "so
  far" mean anything. Ranking needs it, and so does a running total.
- a frame — how much of the ordered partition this row is allowed to see. You rarely write one, and
  the default is the first trap.

Leave all three out and `OVER ()` is one partition holding every row, unordered.
`SUM(revenue) OVER ()` is therefore the grand total stamped onto every row, and percent-of-total is
`revenue * 100.0 / SUM(revenue) OVER ()`. Put an `ORDER BY` inside and the same `SUM` becomes a
running total, because ordering brings a frame with it.

The three ranking functions differ only in what they do with ties, which SQLite defines in terms of
peers: rows with equal values for every `ORDER BY` term.

- `ROW_NUMBER()` — 1, 2, 3, 4. Always distinct, so peers are separated in an order you did not
  choose.
- `RANK()` — the row number of the first peer in the group. Peers share a number and the next value
  skips over them.
- `DENSE_RANK()` — the position of the peer group itself. Peers share a number and nothing is
  skipped.

## Worked example

Every query and result here is real output from the practice database on SQLite 3.51, which has had
window functions since 3.25.0. Postgres behaves the same except where a trap says otherwise. Here
are the four reviews of The Glass Kingdom, best rating first. Two are 5s, which is the only thing
separating the three functions:

```sql
SELECT rating, created_at,
       ROW_NUMBER() OVER (ORDER BY rating DESC) AS row_number,
       RANK()       OVER (ORDER BY rating DESC) AS rank,
       DENSE_RANK() OVER (ORDER BY rating DESC) AS dense_rank
FROM reviews
WHERE book_id = 1
ORDER BY rating DESC, created_at;
```

```
rating  created_at  row_number  rank  dense_rank
5       2023-02-01  1           1     1
5       2023-05-02  2           1     1
4       2023-03-14  3           3     2
3       2024-02-15  4           4     3
```

`RANK` jumps to 3 because two row numbers are already spent. `DENSE_RANK` goes to 2 because one
distinct rating is. `ROW_NUMBER` broke the tie on its own, and which 5 it put first is not something
the query said.

With `PARTITION BY` the numbering restarts for each genre, so keeping `rn = 1` keeps the best book
in each:

```sql
WITH rated AS (
  SELECT b.genre, b.title, AVG(r.rating) AS avg_rating
  FROM books b
  JOIN reviews r ON r.book_id = b.id
  GROUP BY b.id, b.genre, b.title
),
ranked AS (
  SELECT genre, title,
         ROW_NUMBER() OVER (PARTITION BY genre ORDER BY avg_rating DESC) AS rn
  FROM rated
)
SELECT genre, title FROM ranked WHERE rn = 1;
```

```
genre    title
Fantasy  Songs of the Hollow
History  The Paper Road
Mystery  Cold Type
Science  The Restless Atom
```

The filter has to sit outside the CTE. Change the partition to `book_id` and the order to
`created_at DESC` and those same three lines answer a different question: the most recent review of
every book, rating and date still attached. That is the de-duplication idiom, and [set
operations](./set-operations.md) covers when to reach for it instead of `DISTINCT`.

## Traps

**Three rows in a row show the same running total.** Cumulative payroll, ordered by the year each
person was hired:

```sql
SELECT name, strftime('%Y', hired_at) AS hire_year, salary,
       SUM(salary) OVER (ORDER BY strftime('%Y', hired_at)) AS running_total
FROM employees
WHERE hired_at < '2021-01-01'
ORDER BY hire_year, name;
```

```
name           hire_year  salary  running_total
Ada Reyes      2018       210000  210000
Ben Okonkwo    2019       165000  533000
Cara Lindt     2019       158000  533000
Dev Sharma     2020       132000  888000
Elin Haugen    2020       128000  888000
Hugo Marchand  2020       95000   888000
```

Ben's row already contains Cara's salary. An `ORDER BY` inside `OVER` with no frame written down
takes the default, `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, and `RANGE` frames by value
rather than by position: peers are always in the frame together. `ROWS` counts positions instead,
which is what nearly everyone meant, and needs a tiebreaker in the ordering to make those positions
deterministic:

```sql
SUM(salary) OVER (ORDER BY strftime('%Y', hired_at), name
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
```

```
Ada Reyes      2018       210000  210000
Ben Okonkwo    2019       165000  375000
Cara Lindt     2019       158000  533000
Dev Sharma     2020       132000  665000
Elin Haugen    2020       128000  793000
Hugo Marchand  2020       95000   888000
```

Every row now adds its own salary and nothing else. The default is harmless when the ordering column
is unique: `ORDER BY month` over one row per month is safe, and `ORDER BY hire_year` over twelve
people is not.

**`WHERE rn = 1` is an error, not a filter.** SQLite refuses it:
`misuse of window function ROW_NUMBER()`. Postgres forbids window functions in `WHERE`, `GROUP BY`
and `HAVING` because they logically execute after those clauses, and no flag changes it. Compute the
window function in a CTE or a subquery and filter one level up, as the worked example does.

**The share-of-total column changes from row to row.** `SUM(x) OVER ()` and
`SUM(x) OVER (ORDER BY month)` differ only in the `ORDER BY` inside the parentheses. The empty
window sees the entire partition and gives every row the same number; the ordered one sees the
partition up to the current row. A percentage that drifts down the page means an `ORDER BY` meant
for the output crept inside the `OVER`.

**A top-one-per-group query returned two rows for one group.** `RANK()` gives every peer the same
number, so `WHERE rk = 1` keeps all of them: right when ties should all win, wrong when the query
promised one row per group. `ROW_NUMBER()` always returns one but picks the winner arbitrarily, so
add a tiebreaker to the window's `ORDER BY` when two runs of the same query have to agree.

**`MAX` gave you the date and lost the rest of the row.** `GROUP BY book_id` with `MAX(created_at)`
says when the newest review landed but cannot hand you its rating, because an aggregate does not
carry the other columns along, and an engine that lets you select them anyway returns an arbitrary
one. Ranking with `ROW_NUMBER()` and filtering `rn = 1` keeps the winning row whole. Postgres has a
shorter spelling, `DISTINCT ON (book_id)` with a matching `ORDER BY`; SQLite has no such thing, so
the window version is the one that travels.
