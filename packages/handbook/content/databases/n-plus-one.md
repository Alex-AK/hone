---
title: N+1, and how to see it
question: The page takes four seconds and every query in the log is fast. Where is the time going?
order: 5
practise:
  - sql-batch-related-rows
  - orders-report-typeorm
  - slow-list-endpoint-kysely
  - help-board-graphql
  - sql-orders-per-customer
  - orm-batch-one-tick
  - orm-join-or-second-query
sources:
  - author: Markus Winand
    title: Nested Loops
    url: https://use-the-index-luke.com/sql/join/nested-loops-join-n1-problem
  - author: PostgreSQL
    title: Error Reporting and Logging
    url: https://www.postgresql.org/docs/current/runtime-config-logging.html
  - author: PostgreSQL
    title: Using EXPLAIN
    url: https://www.postgresql.org/docs/current/using-explain.html
  - author: SQLite
    title: SQLite Is Serverless
    url: https://www.sqlite.org/serverless.html
verified: 2026-08-01
---

This one is engine-independent, but the tooling is not: the section on finding it splits by engine,
and the two workouts that exercise it run on different ones.

## The model

One query fetches a list. Then something inside the loop over that list touches a related object, and
that touch is another query. N rows, N+1 statements. Nobody writes this deliberately; it falls out of
a lazy relation, or of a helper function that reads like a field access and is a round trip.

It hides because every individual statement is fast. There is nothing to find in a slow query log,
nothing to `EXPLAIN`, and a profiler points at the ORM. Winand's summary of why it costs anything at
all is the useful one: bandwidth has only a minor effect on response time while latency has a large
one, so the number of round trips matters more than the amount of data moved. Four hundred perfect
half-millisecond queries is still four hundred round trips.

Which gives the test. Not the stopwatch, which is noisy and tells you nothing about the cause. Count
statements, then count them again with more rows. If the count moves with the data, you have found
it. Winand's advice for finding it in the first place is unglamorous and correct: turn on SQL logging
in development and read what your ORM actually sent.

Two fixes. Join the related table into the same query, which is one statement whatever N is. Or
batch: collect the ids from the first result and fetch them in one `WHERE id IN (...)`, which is two
statements whatever N is. Batching is the one that survives when the second table is fetched through
a different service or has its own pagination.

## Worked example

The report from the TypeORM workout, as it was written. It looks reasonable until you count:

```ts
const orders = await workspace.orders.find({ order: { id: 'ASC' } });

for (const order of orders) {
  const withCustomer = await workspace.orders.findOne({
    where: { id: order.id },
    relations: { customer: true },
  });
  const lines = await workspace.items.find({ where: { order: { id: order.id } } });
  // ...
}
```

One round trip for the list, then two more for every order in it. The checkpoint measures none of
that in milliseconds. It builds the report for 5 orders, builds it again for 60, and asserts the two
statement counts are equal, then asserts that 60 orders cost at most three statements in total.

The fixed version is one statement, and the shape of it is the part worth memorising:

```ts
const rows = await workspace.orders
  .createQueryBuilder('order')
  .innerJoin('order.customer', 'customer')
  // LEFT, not INNER: an order nobody added a line to still belongs on the report, at zero.
  .leftJoin('order.items', 'item')
  .select('order.id', 'orderId')
  .addSelect('customer.name', 'customerName')
  .addSelect('COUNT(item.id)', 'itemCount')
  // COUNT of no rows is 0, but SUM of no rows is NULL.
  .addSelect('COALESCE(SUM(item.priceCents * item.quantity), 0)', 'totalCents')
  .groupBy('order.id')
  .getRawMany();
```

`sql-orders-per-customer` is that shape with the ORM taken away, and it is worth writing once by
hand. Every customer has to appear, including the ones with no completed orders, which is the
`LEFT JOIN` doing the same job it does here.

## Traps

**Every query in the log is fast, and the page is slow.** Stop reading durations and count rows in
the log. The number that matters is how the count changes between a small dataset and a large one: a
count that stays at three and a count that grows with every row look identical on a development
database with twelve rows in it. That is exactly how this ships.

**Collapsing it into one join multiplies the rows.** An order with 4 line items produces 4 rows;
joining a second collection as well produces the product of the two. One statement that drags every
line item across to be added up in JavaScript has fixed the round trips and kept the real cost.
`COUNT`, `SUM` and `GROUP BY` give you one row per order instead, computed where the data already is.

**The fast version quietly returns fewer rows than the slow one.** An inner join to a child table
drops every parent that has no children, so the empty orders vanish from the report and nobody
notices for a month. `LEFT JOIN` keeps them, and then `SUM` over no rows returns `NULL` rather than
zero, so it needs `COALESCE`. Check the row count against the old implementation before you check the
timing.

**Looking for it in the plan.** `loops=N` on an inner node of an `EXPLAIN ANALYZE` plan is a nested
loop the planner chose, and it is frequently the right choice for twenty rows. Application-level N+1
never appears in any single plan, because each of the N statements has its own. The two problems
share a name and are found in different places.

**Finding it depends on the engine.** In Postgres, `log_min_duration_statement = 0` prints the
duration of every completed statement, and `log_statement = 'all'` logs the statements themselves.
SQLite has no server process to configure at all: the process reads and writes the database file
directly, so the only place to count is the driver or the ORM. Both Hone workouts wrap the query
runner and push every statement into an array, which is also the cheapest thing you can add to a real
codebase.
