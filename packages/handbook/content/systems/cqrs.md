---
title: CQRS
question: The list page wants a different shape from the write path. Do I need a second database?
order: 19
practise:
  - dispatch-board-sqlite
  - sys-cache-aside-vs-write-through
  - sys-replica-lag
  - sys-strong-vs-eventual-consistency
  - sys-dual-write-two-orderings
  - sys-event-fold
  - outbox-relay-node
sources:
  - author: Greg Young
    title: CQRS Documents
    url: https://cqrs.wordpress.com/wp-content/uploads/2010/11/cqrs_documents.pdf
  - author: Martin Fowler
    title: CQRS
    url: https://martinfowler.com/bliki/CQRS.html
  - author: Martin Fowler
    title: CommandQuerySeparation
    url: https://martinfowler.com/bliki/CommandQuerySeparation.html
  - author: Microsoft
    title: CQRS pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
  - author: PostgreSQL
    title: REFRESH MATERIALIZED VIEW
    url: https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html
verified: 2026-08-19
---

Most apps change data and display it through the same tables and the same code. CQRS is the idea
that those two jobs can be designed separately, because a screen wants a different shape from the
code that enforces the rules. It is often taken to mean a second database, which is only its most
expensive form.

## The model

CQRS means writes and reads go through two separate models, and nothing in that requires two
databases. Greg Young, who named it, splits one object into a command object and a query object.
Fowler: "The change that CQRS introduces is to split that conceptual model into separate models for
update and display." Neither says database. The pattern is a ladder, and the rungs cost very
different amounts:

```
one model            the same rows and the same objects serve writes and reads

two models, one db   a write path holding the domain logic and its invariants,
                     a read path that queries the same tables and returns what
                     the screen needs        <- no staleness, no new storage

two stores           the read side is its own store, fed by events or a relay
                     from the write side     <- eventually consistent, and this
                                                is where the bill arrives
```

Young's first step is the middle rung, and it moves no data: one `CustomerService` becomes a
`CustomerWriteService` and a `CustomerReadService` over the same tables, and he says there is
nothing wrong with tying that thin read layer to a database vendor. The read side gets the flat
result shape a domain model would not tolerate, and the domain stops growing getters that exist only
to build DTOs.

The two sides want different shapes because they are optimised for different things. The write side
defends invariants over one order at a time and wants normalised tables; the read side wants "the 50
newest pending orders with their totals" already assembled. Young argues that no single model can be
optimal for searching, reporting and processing transactions at once.

Three things CQRS is not:

- **CQS** is Meyer's rule about methods: a query returns a result without changing observable state,
  and a command changes state without returning a value. CQRS applies that split to models.
- **Event sourcing** is a persistence decision, and [it has its own page](./event-sourcing.md).
  Events are the usual way to feed a separate read store, but a read model built by an `UPDATE` in
  the same transaction is still CQRS and involves no log.
- **A second database** is the top rung, not the definition. Microsoft's write-up treats separate
  stores as a more advanced implementation than separate models in one store.

Fowler warns that for most systems CQRS adds risky complexity, and that it belongs only on specific
portions of a system. The measurements below are one reason why.

## Worked example

Measured on PostgreSQL 17.10 with a warm cache: 200,000 orders, 50,000 of them `pending`. Times are
`EXPLAIN ANALYZE` execution time. SQLite has no materialized views; the read model here is an
ordinary table, which it does have.

The list page wants the 50 newest pending orders with the customer's name, the item count and the
total. Written the obvious way, it groups over every pending order and then throws away all but 50:

```sql
SELECT o.id, o.placed_at, c.name,
       count(i.id) AS items, coalesce(sum(i.qty * i.unit_cents), 0) AS total_cents
FROM "order" o
JOIN customer c ON c.id = o.customer_id
LEFT JOIN order_item i ON i.order_id = o.id
WHERE o.status = 'pending'
GROUP BY o.id, o.placed_at, c.name
ORDER BY o.placed_at DESC
LIMIT 50;
```

Rewritten to find the page first and aggregate only those 50, on an index of
`(status, placed_at DESC, id)`, it returns rows identical to the query above:

```sql
SELECT o.id, o.placed_at, c.name, agg.items, agg.total_cents
FROM "order" o
JOIN customer c ON c.id = o.customer_id
CROSS JOIN LATERAL (
  SELECT count(*) AS items, coalesce(sum(i.qty * i.unit_cents), 0) AS total_cents
  FROM order_item i WHERE i.order_id = o.id
) agg
WHERE o.status = 'pending'
ORDER BY o.placed_at DESC
LIMIT 50;
```

```
group over 50,000 pending orders, then take 50      84 ms
the same answer, paged first                         0.30 ms
a read-model table, one index scan                   0.028 ms
```

**The rewrite closed 99.6% of the gap with a query change, not an architecture.** A slow list
endpoint is not evidence that you need a read model, and it is the most common reason one gets
built.

Now sort the same pending orders by their total, biggest first. No index on the write model helps,
because the value being sorted on is not stored in any row:

```
group over 50,000 pending orders, sorted by total   92 ms
a read model, indexed on (status, total_cents DESC)  0.075 ms
```

That is the line: a read model earns its place when reads filter or sort on something derived, not
when a join is written badly.

The projection is ordinary code, and at this size a full rebuild from the write model takes 275 ms:

```sql
INSERT INTO order_list_row (order_id, status, placed_at, customer_name, item_count, total_cents)
SELECT o.id, o.status, o.placed_at, c.name,
       count(i.id), coalesce(sum(i.qty * i.unit_cents), 0)
FROM "order" o
JOIN customer c ON c.id = o.customer_id
LEFT JOIN order_item i ON i.order_id = o.id
WHERE o.id = $1
GROUP BY o.id, o.status, o.placed_at, c.name
ON CONFLICT (order_id) DO UPDATE SET
  status = excluded.status, customer_name = excluded.customer_name,
  item_count = excluded.item_count, total_cents = excluded.total_cents;
```

## Traps

**Someone saves and the list still shows the old value.** The read side is behind, and to the person
who pressed the button the save looks failed. This is [replica lag](./replication.md) by another
route, with the same three answers: return the new state from the command, read the write model for
that user briefly after their own write, or have the UI show the value it sent. Choose one, or the
user presses save twice.

**The read model drifted and nobody noticed for a month.** Updating a separate store after
committing the write is [a dual write](./two-systems-one-write.md), so a crash between the two
leaves a row that no query will return and no error will mention. First, make the projection
rebuildable from the write model and rebuild it on a schedule, so drift gets repaired even when
nobody detects it. Then feed it from something transactional, an outbox row or the event log, rather
than a publish that can be lost. Both assume the projection is idempotent, because it will see the
same change twice.

**We refreshed the materialized view and the page hung.** A materialized view is the cheapest read
model in Postgres, and a plain refresh takes an `AccessExclusiveLock` on it, which the docs say
"could block other connections which are trying to read from the materialized view".
`REFRESH MATERIALIZED VIEW CONCURRENTLY` avoids that, and has a precondition people meet at the
worst moment:

```
ERROR:  cannot refresh materialized view "public.order_list_mv" concurrently
HINT:  Create a unique index with no WHERE clause on one or more columns of the materialized view.
```

Create that unique index with the view, not during the incident. `CONCURRENTLY` is also slower and
still allows one refresh at a time per view, so a view that takes minutes to rebuild is a scheduling
problem either way.
