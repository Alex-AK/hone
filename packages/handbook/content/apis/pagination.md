---
title: Pagination
question: How do I page through a list that keeps changing while someone reads it?
order: 1
practise:
  - http-cursor-tiebreaker
  - http-pagination-cursor
  - slow-list-endpoint-kysely
  - records-sorting-drizzle
  - request-boundary-zod
sources:
  - author: PostgreSQL
    title: 'Queries: LIMIT and OFFSET'
    url: https://www.postgresql.org/docs/current/queries-limit.html
  - author: Markus Winand
    title: Paging Through Results
    url: https://use-the-index-luke.com/sql/partial-results/fetch-next-page
  - author: SQLite
    title: Row Values
    url: https://www.sqlite.org/rowvalue.html
verified: 2026-08-01
---

## The model

There are two ways to say "give me the next twenty", and they differ in what the request names.

Offset names a count: skip 40, take 20. Cursor pagination, also called keyset or seek, names a row:
everything sorting after this one, take 20. Every difference between the two falls out of that.

Offset degrades in two directions, and they are worth separating because they get fixed differently.

It degrades in correctness because an offset is a position in a list that keeps moving. Three posts
get published between the request for page 1 and the request for page 2, so row 40 is no longer the
row that was at 40, and the reader meets a post they already read. A deletion has the mirror effect:
page 2 starts one row late and a post is skipped. The PostgreSQL docs are blunt about the weaker
version of this problem, which is ordering: without an `ORDER BY` that constrains rows into a unique
order, different LIMIT/OFFSET values "will give inconsistent results", because SQL promises no order
at all otherwise. A unique order removes that ambiguity. It does nothing about the drift, because
the drift is the data changing rather than the query being sloppy.

It degrades in cost because the skipped rows are not free. Again from the PostgreSQL docs: "The rows
skipped by an `OFFSET` clause still have to be computed inside the server; therefore a large
`OFFSET` might be inefficient." `OFFSET 100000 LIMIT 20` produces a hundred thousand and twenty rows
in sorted order and discards the first hundred thousand. Page 1 is instant and page 5000 is a scan.

Keyset pagination replaces both problems with a `WHERE` clause. The cursor carries the sort key of
the last row you saw, the query asks for rows past it, and an index on the sort key seeks straight
there. The cost of page 5000 is the cost of page 1, and an insert elsewhere in the list cannot move
your place, because your place is a row rather than a number.

The tiebreaker is the part that gets left out. A cursor identifies a row only if the sort key is
unique. Sort by `created_at` alone, let three posts share a second, and the boundary between two
pages lands in the middle of them. Append something unique, usually the primary key, to both the
`ORDER BY` and the cursor. SQLite's docs call this shape a scrolling window query and note that with
an appropriate index it runs "much more efficiently than OFFSET".

What you give up is random access. There is no page 47, and no cheap total row count to build a
numbered pager from. For a feed, an infinite scroll or a job walking the whole table that is not a
loss. For an admin table where people jump to page 12 and expect to land in the same place twice, it
is, and offset with a frozen snapshot may be the honest answer.

## Worked example

The two queries, and the cursor that joins them:

```sql
-- Page 1. The sort key is two columns, so the cursor is two values.
SELECT id, title, created_at
FROM posts
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- Page 2, anchored on the last row page 1 returned.
SELECT id, title, created_at
FROM posts
WHERE (created_at, id) < ('2026-03-14 09:12:00', 8931)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

`(created_at, id) < (?, ?)` is a row value comparison: one comparison over a pair, not two
comparisons joined by `AND`. It means exactly this, which is what you write where row values are not
available:

```sql
WHERE created_at < '2026-03-14 09:12:00'
   OR (created_at = '2026-03-14 09:12:00' AND id < 8931)
```

Support is uneven. SQLite has row values from 3.15.0 and PostgreSQL from 8.4. MySQL parses them but
will not use one as an index access predicate, which was the entire point, so there you write the
expanded form and read the plan.

On the wire, hand the cursor back as one opaque string rather than as two query parameters:

```
GET /posts?limit=20
  -> { "items": [ ... ], "nextCursor": "MjAyNi0wMy0xNFQwOToxMjowMFo6ODkzMQ" }

GET /posts?limit=20&after=MjAyNi0wMy0xNFQwOToxMjowMFo6ODkzMQ
```

Opaque because the encoding is yours to change. The moment a client parses it, your sort key is part
of the public contract, and adding a tiebreaker becomes a breaking change.

## Traps

**Page 2 opens with a post they already read.** Someone published while they were reading, so offset
20 points one row further into the list than it did a moment ago. The mirror case is the quiet one:
a deletion makes page 2 start late, a post is skipped, and nothing in the UI hints that it existed.
Neither reproduces against a static seed, which is why this ships.

**One row never appears on any page.** The sort key was not unique. Three rows share a `created_at`,
the page boundary falls between them, and `WHERE created_at < ?` excludes all three while `<=`
returns all three twice. Both are wrong, in opposite directions, and the fix for both is the id.

**The cursor was split into two conditions and rows went missing.** `WHERE created_at <= ? AND id <
?` looks like the expansion of the row value comparison. It is not. It also drops every older row
whose id happens to be larger than the cursor's, which for anything not inserted in timestamp order
is most of them. Write the row value form, or the `OR` expansion, and never the naive `AND`.

**The list endpoint got slow and nothing about it changed.** The table grew. Offset cost is
proportional to depth, so this arrives a year late and arrives first for the client that pages
deepest, which is usually a script rather than a person. Sorting or filtering in application code
after the fetch has the same shape and is worse: the database cannot use an index for work you did
not ask it to do.
