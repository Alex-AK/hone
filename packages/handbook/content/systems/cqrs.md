---
title: CQRS
question: The list page wants a different shape from the write path. Do I need a second database?
order: 19
practise:
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

## The model

CQRS makes one claim: what you write through and what you read through are two models. Greg Young, who
named it, puts the split at the object level, "in CQRS objects are split into two objects, one
containing the Commands one containing the Queries". Fowler states the same thing about models: "The
change that CQRS introduces is to split that conceptual model into separate models for update and
display."

Neither definition says database, and that is the part that goes missing. What the pattern describes
is a ladder, and the rungs cost very different amounts:

```
one model            the same rows and the same objects serve writes and reads

two models, one db   a write path holding the domain logic and its invariants,
                     a read path that queries the same tables and returns what
                     the screen needs        <- no staleness, no new storage

two stores           the read side is its own store, fed by events or a relay
                     from the write side     <- eventually consistent, and this
                                                is where the bill arrives
```

Young's first step is the middle rung and it moves no data at all: one `CustomerService` becomes a
`CustomerWriteService` and a `CustomerReadService` over the same tables. He calls the read half a
"Thin Read Layer", and says it "need not be isolated from the database, it is not necessarily a bad
thing to be tied to a database vendor from the read layer". That is the point of the split. The read
side gets the vendor-specific query and the flat result shape that a domain model would not tolerate,
and the domain stops growing getters and prefetch paths that exist only to build DTOs.

The reason the two sides want different shapes is that they are optimised for different things. The
write side defends invariants over one order at a time and wants normalisation; the read side answers
"the 50 newest pending orders with their totals" and wants the answer already assembled. Young's
version: the command side stores "in a normalized way, probably near 3rd Normal Form", the query side
"in a denormalized way to minimize the number of joins", and "it is not possible to create an optimal
solution for searching, reporting, and processing transactions utilizing a single model."

Three things CQRS is not:

- **CQS** is Meyer's rule about methods: a query returns "a result and do not change the observable
  state of the system", a command changes "the state of a system but do not return a value". CQRS
  applies that split to models rather than methods. Young's history says the two were discussed as one
  thing "for a long time" before "it was correctly deemed to be a different pattern".
- **Event sourcing** is a persistence decision, and [it has its own page](./event-sourcing.md). Events
  are the usual way to feed a separate read store, which is why the two arrive together, but a read
  model built by an `UPDATE` in the same transaction is still CQRS and involves no log.
- **A second database** is the top rung, not the definition. Microsoft's write-up separates the two
  explicitly, "separate models in a single data store" as the foundational level and separate stores
  as "a more advanced CQRS implementation".

Fowler's caution is worth quoting because it is the part that gets skipped: "you should be very
cautious about using CQRS", "for most systems CQRS adds risky complexity", and it "should only be used
on specific portions of a system". The measurements below are one reason why.

## Worked example

PostgreSQL 17.10, warm cache, 200,000 orders across 20,000 customers with 450,000 items, 50,000 of the
orders `pending`. Times are `EXPLAIN ANALYZE` execution time. SQLite has no materialized views; the
read model here is an ordinary table, which it does have.

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

**The rewrite closed 99.6% of the gap, and it is a query change rather than an architecture.** A slow
list endpoint is not evidence that you need a read model, and this is the single most common reason
one gets built.

Here is a query where the rewrite has nothing to offer. Sort the same pending orders by their total,
biggest first, and no index on the write model can help, because the value being sorted on does not
exist in any row:

```
group over 50,000 pending orders, sorted by total   92 ms
a read model, indexed on (status, total_cents DESC)  0.075 ms
```

You cannot index a value you do not store. That is the line: a read model earns its place when reads
filter or sort on something derived, not when a join is written badly.

The projection that maintains it is ordinary code, and at this size the whole thing rebuilds from the
write model in 275 ms:

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
who just pressed the button it looks like the save failed. This is
[replica lag](./replication.md) wearing different clothes, and it has the same three answers: return
the new state from the command instead of re-reading, read the write model for that user for a short
window after their own write, or make the UI show the value it just sent. Choose one deliberately,
because the default is that the user presses save twice. Microsoft's write-up puts the cost plainly:
"detecting and handling scenarios where a user acts on stale data requires careful consideration."

**The read model drifted and nobody noticed for a month.** Updating a separate store after committing
the write is [a dual write](./two-systems-one-write.md), so a crash between the two leaves a row that
no query will ever return and no error will ever mention. Two things make this survivable, and the
first matters more. Make the projection rebuildable from the write model and rebuild it on a schedule:
drift you repair on a cron is a different problem from drift you cannot detect. Then feed it from
something transactional, an outbox row or the event log, rather than a publish that can be lost. Both
halves assume the projection is idempotent, because it will see the same change twice.

**We refreshed the materialized view and the page hung.** A materialized view is the cheapest read
model in Postgres, and the refresh takes an `AccessExclusiveLock` on it, which blocks the selects your
page is making. The docs are explicit that a plain refresh "could block other connections which are
trying to read from the materialized view". `REFRESH MATERIALIZED VIEW CONCURRENTLY` avoids that, and
has a precondition people meet at the worst moment:

```
ERROR:  cannot refresh materialized view "public.order_list_mv" concurrently
HINT:  Create a unique index with no WHERE clause on one or more columns of the materialized view.
```

Create that unique index when you create the view, not during the incident. `CONCURRENTLY` is also
slower and still allows only one refresh at a time against a given view, so a view that takes minutes
to rebuild is a scheduling problem whichever way you refresh it.
