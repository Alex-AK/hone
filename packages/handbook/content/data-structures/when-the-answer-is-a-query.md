---
title: When the answer is a query
question: I built the index in JavaScript and it is still slow. Should this have been a query?
order: 5
practise:
  - sql-batch-related-rows
  - orders-report-typeorm
  - sys-sharding-partitioning
  - sql-dedupe-keep-latest
  - sql-like-search
  - slow-list-endpoint-kysely
sources:
  - author: SQLite
    title: EXPLAIN QUERY PLAN
    url: https://www.sqlite.org/eqp.html
  - author: SQLite
    title: The SQLite Query Optimizer Overview
    url: https://www.sqlite.org/optoverview.html
  - author: SQLite
    title: SQLite Is Serverless
    url: https://www.sqlite.org/serverless.html
  - author: PostgreSQL
    title: 'Frontend/Backend Protocol: Message Flow'
    url: https://www.postgresql.org/docs/current/protocol-flow.html
verified: 2026-08-02
---

It is easy to fetch every row and then filter, sort, total or match them up in your own code. The
database could have done that work before sending anything, often with an index that skips most of
the table. Doing it afterwards means hauling rows you throw away, and scanning where the database
could have gone straight to the answer. Moving the work into the query is usually right, and
occasionally it is the bug.

## The model

Four operations get done in application code after a fetch, and it is always the same four:
**filter, sort, aggregate, join**. Each costs the same two things, because the database has two your
process does not: an index, and the rows already in memory on its side of the wire. So the bill is
what crossed the wire to reach you, and what could have been an index seek and was a scan instead.

**A filter you ran in JavaScript used no index, because the database was never asked.** To be usable
by an index a `WHERE` term names a column and an operator, per SQLite's optimizer overview, and a
statement carrying none scans. The rest: an aggregate ships every row over to be added up and
discarded, a sort redoes an index's work, and a join is a loop by hand. Paging is the same mistake,
[at the database](../databases/pagination-at-the-database.md), [in the API](../apis/pagination.md).

Pushing work down is not free, though, and is sometimes the bug. The rule: push it down when it
reduces what crosses the wire or lets an index do it, and keep it in the app when it needs something
the database does not have, or when pushing it down turns one statement into per-row work.

This is the question before [choosing a structure](./choosing-a-structure.md), which assumes the
rows have already arrived.

## Worked example

40,000 orders in an in-memory SQLite database, 800 customers, 263 of them `pending`. SQLite 3.53.2,
better-sqlite3 12.11.1, Node 24.16.0, median of 25 runs on an arm64 Mac.

```js
// Revenue per customer, computed in the query, and then computed after the fetch.
db.prepare('SELECT customer_id, SUM(total_cents) AS total FROM orders GROUP BY customer_id').all();
const totals = new Map();
for (const r of db.prepare('SELECT customer_id, total_cents FROM orders').all())
  totals.set(r.customer_id, (totals.get(r.customer_id) ?? 0) + r.total_cents);
```

800 rows from the query, 40,000 from the fetch, at 7.42 ms against 6.76 ms. The two stay within a
millisecond of each other however the run goes, and printing that is honest: both plans scan the
table, and in SQLite "there is no intermediary server process", so there is no wire for the other
39,200 rows to cross. They cost 40,000 JavaScript objects instead of 800, plus a `DataRow` message
each on a socket if this were Postgres. Filtering is where the gap opens: the newest 20 pending
cost 0.003 ms and 20 rows against 8.62 ms and 40,000. `EXPLAIN QUERY PLAN`, verbatim:

```
-- SELECT id, total_cents FROM orders WHERE status = 'pending';   without, then with, an index
SCAN orders
SEARCH orders USING INDEX orders_status_idx (status=?)
-- SELECT id, status, total_cents FROM orders;   the app filtered it afterwards
SCAN orders
-- WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20, on (status, created_at DESC)
SEARCH orders USING COVERING INDEX orders_status_created_idx (status=?)
```

"SCAN" is a full-table scan and "SEARCH" visits only a subset, so the third plan is this page in one
line: the index exists and nothing in the statement reaches it. The fourth is
[column order](../databases/composite-indexes-and-column-order.md), and the vocabulary is
[reading EXPLAIN](../databases/reading-explain.md).

## Traps

**The endpoint returns twenty rows and the query log holds one fast statement.** It has no `WHERE`,
no `ORDER BY` and no `LIMIT`, because all three run after the fetch. That is not
[N+1](../databases/n-plus-one.md) but one round trip carrying 40,000 rows: move the clauses into it.

**We moved it into the query and it got slower.** A correlated subquery in the select list "must be
run once for each output row in the outer SELECT", so one statement hid 800 inner queries and
counting statements never found it. The fix is [subqueries and CTEs](../sql/subqueries-and-ctes.md).

**The join moved more data than the two queries did.** A join to a child table emits one row per
match, so a page of 20 orders came back as 62 rows here. Aggregate with `COUNT` and `SUM`, or batch
the second table with `WHERE id IN`, and [price the merge](./what-o-notation-is-for.md) you now own.

**The report broke the week the users table was split across four databases.** A cross-shard join
has no server-side version, because no server holds both sides. Read keys from one shard, batch the
other side, and merge in your process, which is the one place that is the right answer.
