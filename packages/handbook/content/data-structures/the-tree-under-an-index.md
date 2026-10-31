---
title: The tree under an index
question: How does an index find the start of a range without reading everything before it?
order: 6
practise:
  - sql-index-range-descent
  - sql-index-order-desc
  - sql-index-lower-email
  - sql-index-like-prefix
  - sql-index-composite-order
  - sql-like-search
sources:
  - author: PostgreSQL
    title: B-Tree Indexes
    url: https://www.postgresql.org/docs/current/btree.html
  - author: PostgreSQL
    title: Index Types
    url: https://www.postgresql.org/docs/current/indexes-types.html
  - author: PostgreSQL
    title: Indexes on Expressions
    url: https://www.postgresql.org/docs/current/indexes-expressional.html
  - author: PostgreSQL
    title: Multicolumn Indexes
    url: https://www.postgresql.org/docs/current/indexes-multicolumn.html
verified: 2026-08-02
---

An index lets a database jump to the rows you asked for instead of reading the whole table. It keeps
the values in a short, wide tree, so finding where a range starts takes a few steps however big the
table gets. The same shape decides which searches it can help: one that names where to start and
which way to walk is fast, and one that doesn't reads everything anyway.

## The model

An index is a tree of 8kB pages: the sorted copy that [how an index gets
used](../databases/how-an-index-gets-used.md) describes, arranged so that reaching the first match
never means searching all of it. Postgres: "Leaf pages are the pages on the lowest level of the
tree... Each internal page contains tuples that point to the next level down in the tree." A search
starts at the root, compares your value against that page's separator keys, and follows one pointer.

```
root      [ * | 2024-06-01 | * | 2024-09-01 | * ]        one page; * is a pointer down
internal  [ * | 06-01 00:00 | * | 06-01 06:00 | * ]      one level, or a few
leaves    <-> [ 06-01 00:00:20 -> row ] <-> [ ... ] <->  over 99% of the pages
```

The tree stays short because a page holds many keys, and the docs put it as "Typically, over 99% of
all pages are leaf pages." On PostgreSQL 18.3 a primary-key lookup touched 3 pages against 1,000
rows and 4 against 1,000,000: cost tracks [height rather than length](./what-o-notation-is-for.md).

Every level "can be used as a doubly-linked list of pages", and the bottom holds the indexed values
in key order. A range scan is two movements: descend to the first qualifying entry, then walk the
leaves until the values leave the range. The walk runs either way and reads `Index Scan Backward`,
which is why [column order](../databases/composite-indexes-and-column-order.md) can say either end.

An index therefore helps with a predicate that becomes **a starting point and a direction**, and
nothing else. Postgres rewrites `LIKE 'ali%'` into one "if the pattern is a constant and is
anchored to the beginning of the string"; `%ali%` names no first character. `lower(email) = $1`
names none either: the leaves sit in `email` order, so index the expression, spelled as the query
spells it. A composite index has one once its leading columns are pinned, and Postgres 18 rescues a
slice with a skip scan: 20 tenants gave `Index Searches: 21` here, one descent per distinct value,
while 200,000 collapsed to `Index Searches: 1` and read every page of the index. Neither a hash nor
an array does both ([choosing a structure](./choosing-a-structure.md)). Whether to reach for one at
all is [when the answer is a query](./when-the-answer-is-a-query.md).

## Worked example

1,000,000 rows in PGlite 0.5.4, which is PostgreSQL 18.3, C collation. `EXPLAIN (ANALYZE, BUFFERS)`
verbatim, warm, costs trimmed. `Buffers: shared hit` is 8kB pages touched; the table is 9,346.

```
-- SELECT email FROM events WHERE id >= 617000 AND id < 617180;
Index Scan using events_pkey on events (actual rows=180.00 loops=1)
  Index Cond: ((id >= 617000) AND (id < 617180))
  Index Searches: 1
  Buffers: shared hit=7
-- the identical 180 rows, with enable_indexscan off
Seq Scan on events (actual rows=180.00 loops=1)
  Buffers: shared hit=9346
-- ORDER BY created_at DESC LIMIT 5;  ascending is Index Scan, both at 4 pages
Index Scan Backward using events_created_at_idx on events (actual rows=5.00 loops=1)
-- WHERE email LIKE 'user000123%';    no LIKE is left in the Index Cond
Index Scan using events_email_idx on events (actual rows=10.00 loops=1)
  Index Cond: ((email >= 'user000123'::text) AND (email < 'user000124'::text))
```

`Index Searches: 1` is the descent, counted: one trip from the root whatever the row count, and the
other six pages are the walk. The anchored pattern became a starting point and a stopping point;
written `'%000123%'` it is `Seq Scan on events`, all 9,346 pages for 11 rows. That vocabulary, and
SQLite's shorter version of it, is [reading EXPLAIN](../databases/reading-explain.md).

## Traps

**The plan says `Index Scan` and the query still takes seconds.** The descent is one page per level,
the walk as long as the range: `WHERE id >= 500000` here is an index scan that touches 6,043 pages
against the table's 9,346, priced by [selectivity](../databases/how-an-index-gets-used.md).

**`LIKE 'ali%'` uses the index locally and scans in production.** The range rewrite needs the index
to sort the way the pattern compares, which the default operator class only does under the C
collation. An `en_US.utf8` column scanned here while equality did not: add `text_pattern_ops`.

**The second index, declared `DESC`, changed nothing.** Reversing every term of a sort is the same
walk backwards at the same 4 pages, so the mirror buys writes and disk for no new answers. A
declared direction pays only inside a multicolumn index whose columns disagree.
