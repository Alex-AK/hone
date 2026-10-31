---
title: Pagination at the database
question: The second page repeats a row I already saw. What is wrong with OFFSET?
order: 6
practise:
  - http-offset-cost
  - http-pagination-cursor
  - sqlperf-keyset-page
  - sqlperf-count-total-cost
  - slow-list-endpoint-kysely
  - alert-feed-sqlite
  - product-search-drizzle
  - records-sorting-drizzle
sources:
  - author: Markus Winand
    title: Paging Through Results
    url: https://use-the-index-luke.com/sql/partial-results/fetch-next-page
  - author: PostgreSQL
    title: LIMIT and OFFSET
    url: https://www.postgresql.org/docs/current/queries-limit.html
  - author: PostgreSQL
    title: Row Constructor Comparison
    url: https://www.postgresql.org/docs/current/functions-comparisons.html
  - author: SQLite
    title: Row Values
    url: https://www.sqlite.org/rowvalue.html
verified: 2026-08-01
---

Showing a long list a page at a time is usually done by telling the database how many rows to skip.
Skipping still costs: the database builds every row it skips, so each page deeper in gets slower.
And because the count starts over on every request, a row added or removed in between shifts
everything along, so a reader sees one row twice or never sees another.

## The model

`OFFSET 200` is not a position in a result set. It is an instruction to compute the first 220 rows
and discard 200 of them, every time, from scratch. The Postgres docs put it plainly: the rows skipped
by `OFFSET` still have to be computed inside the server, so a large `OFFSET` might be inefficient.

Two failures fall out of that one fact. The work grows with how far in you are rather than with how
much you asked for, so deep pages get slower and slower. And because each request recomputes the
result, the numbering is done again from scratch: a row inserted before your window pushes everything
down by one, so a row you already read slides onto the next page, and a deletion pulls one past you
unseen. Winand's version of that is the sharpest: using the number of rows you have seen to skip over
them later is wrong as soon as the data can change underneath you.

Keyset pagination, or what Winand calls the seek method, replaces the count with a value. Remember
the sort key of the last row on the page, and ask for the rows that come after it:

```sql
SELECT id, created_at FROM orders
 WHERE status = 'pending'
   AND (created_at, id) < ($1, $2)
 ORDER BY created_at DESC, id DESC
 LIMIT 20;
```

`(created_at, id) < ($1, $2)` is a row value comparison, and it is not shorthand for two `AND`s. The
elements are compared left to right, stopping at the first unequal pair, which is exactly the rule
`ORDER BY created_at DESC, id DESC` uses to order rows. That is why one condition expresses "comes
after this row" and why the database can turn it into a single index range.

Two things have to be true for it to work. The order must be total, which usually means appending a
unique column as a tiebreaker, and the index has to be able to produce that exact order.

## Worked example

The plans are Postgres, from the query-plan workout. The orders list, 239 pending rows, an index on
`(status, created_at DESC)`, and `OFFSET 200`:

```
Limit  (cost=315.32..315.37 rows=20 width=12) (actual time=0.365..0.376 rows=20.00 loops=1)
  ->  Sort  (cost=314.82..315.44 rows=248 width=12) (actual time=0.303..0.338 rows=220.00 loops=1)
        Sort Key: created_at DESC, id DESC
        ->  Bitmap Heap Scan on orders  (cost=6.21..304.95 rows=248 width=12) (actual time=0.059..0.225 rows=239.00 loops=1)
              Recheck Cond: (status = 'pending'::text)
              ->  Bitmap Index Scan on orders_status_created_at_idx  (cost=0.00..6.15 rows=248 width=0)
                    Index Cond: (status = 'pending'::text)
```

Read the actual `rows` from the bottom up: 239 fetched, 220 sorted, 20 returned. Two hundred of those
220 were built so they could be thrown away. Now the keyset version of the same page, with `id` added
to the index so the whole `ORDER BY` is in it:

```
Limit  (cost=0.41..69.93 rows=20 width=12) (actual time=0.083..0.100 rows=20.00 loops=1)
  ->  Index Only Scan using orders_status_keyset_idx on orders  (cost=0.41..129.02 rows=37 width=12) (actual time=0.082..0.092 rows=20.00 loops=1)
        Index Cond: ((status = 'pending'::text) AND (ROW(created_at, id) < ROW('2023-02-19 10:03:00-08'::timestamp with time zone, 6513)))
        Heap Fetches: 20
```

Twenty rows produced for twenty rows returned, no sort, and the same plan for page 2 as for page 200.
SQLite does the same thing and says so in one line:
`SEARCH orders USING COVERING INDEX orders_keyset_idx (status=? AND created_at<?)`.

What you give up is real and worth naming before you commit: there is no jumping to page 47, only
next and previous, and there is still no total unless you run a second counting query.

## Traps

**The second page repeats a row, and nothing was inserted.** The sort key is not unique, so rows that
tie can come back in either order and the two requests disagreed about which one was twentieth. Twelve
products in the search workout share a name, which is why ordering by name alone lets rows move
between pages. The Postgres docs are explicit that `LIMIT` without an `ORDER BY` that constrains rows
into a unique order gives an unpredictable subset, and that different `LIMIT`/`OFFSET` values give
inconsistent results unless you enforce a predictable ordering. Append the primary key to the
`ORDER BY`, and to the cursor.

**Writing the cursor out longhand and losing the index.** The expansion of the row value,
`created_at < $1 OR (created_at = $1 AND id < $2)`, returns the same rows. Against the same index,
Postgres turned it into a `BitmapOr` of two index scans feeding a `Sort`, reading 38 rows instead of
20 and reintroducing the sort the keyset was supposed to remove. Write the tuple.

**Mixing sort directions breaks the tuple.** `(a, b) < ($1, $2)` compares the whole row in one
direction, so it only expresses `ORDER BY a DESC, b DESC` or, flipped to `>`, `ORDER BY a ASC, b ASC`.
`ORDER BY a DESC, b ASC` cannot be written as a single row comparison, and it is also the case a
plain composite index cannot serve without a sort. If a sortable table column needs a cursor, the
tiebreaker has to follow the same direction as the column it is breaking ties for.

**A nullable sort column drops rows silently.** Row comparison stops at the first pair of elements
that are unequal or null, and if either element of that pair is null the result of the comparison is
unknown rather than true or false. A row whose `created_at` is `NULL` therefore never satisfies the
cursor condition and is never returned on any page. Keyset needs `NOT NULL` sort columns, or an
expression that removes the nulls and an index built on the same expression.

**One version cutoff.** SQLite gained row values in 3.15.0, released 2016-10-14. Anything older has
no tuple comparison at all and the longhand `OR` form is the only option available. Postgres supports
row constructor comparison for `=`, `<>`, `<`, `<=`, `>` and `>=`, which covers every cursor you will
write.
