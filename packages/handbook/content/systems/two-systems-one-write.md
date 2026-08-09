---
title: Two systems, one write
question: The row committed and the search index never heard about it. Where does that get fixed?
order: 15
practise:
  - sys-dual-write-two-orderings
  - outbox-relay-node
  - sys-idempotency
  - sys-ack-after-work
  - sys-message-delivery-semantics
  - idempotent-payments-express
sources:
  - author: Amazon Web Services
    title: 'Cloud design patterns: transactional outbox pattern'
    url: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
  - author: Chris Richardson
    title: 'Pattern: Transactional outbox'
    url: https://microservices.io/patterns/data/transactional-outbox.html
  - author: Chris Richardson
    title: 'Pattern: Transaction log tailing'
    url: https://microservices.io/patterns/data/transaction-log-tailing.html
  - author: PostgreSQL
    title: Sequence Manipulation Functions
    url: https://www.postgresql.org/docs/current/functions-sequence.html
verified: 2026-08-08
---

## The model

One logical write, two systems, and no transaction spanning them. AWS names the shape: "A dual write
operation occurs when an application writes to two different systems; for example, when a microservice
needs to persist data in the database and send a message to notify other systems."

There are two orderings available and **both are broken**. You are not picking a correct one, you are
picking which failure you get:

```
commit the row, then publish          publish, then commit the row
────────────────────────────          ────────────────────────────
crash in between:                     crash in between:
  the row exists                        the message is out
  nobody downstream is told             the row was never written
  drift, silent and permanent           downstream acted on a fact
                                        that is not true
```

AWS states both directions: "If the database update is successful but the event notification fails,
the downstream service will not be aware of the change, and the system can enter an inconsistent
state", and "If the database update fails but the event notification is sent, data could get
corrupted, which might affect the reliability of the system."

The window between the two is small, and that is what makes it dangerous rather than safe. It is not a
race you will reproduce in testing. It is a crash, a deploy that stopped the pod, an OOM kill, or a
partition, and each one costs one record that nobody notices until a customer does.

**The resolution is to stop having two writes.** Make the second system's input something the first
system can write transactionally: an `outbox` row, in the same database, in the same transaction as
the change it describes. A separate relay reads that table and publishes. The only atomic operation
anyone needs is the one the database already gives you, which is the point, because as Richardson's
version of the pattern puts it, "2PC is not an option. The database and/or the message broker might
not support 2PC."

Be exact about what this buys. Messages "are guaranteed to be sent if and only if the database
transaction commits". It is not exactly-once, because the relay can publish and die before marking the
row sent, which AWS spells out: the service "might send out duplicate messages or events, so we
recommend that you make the consuming service idempotent by tracking the processed messages". **The
outbox converts a silent loss into a visible duplicate**, and a duplicate has a known fix while a
silent loss does not. That fix is [queues and delivery semantics](./queues-and-delivery-semantics.md),
unchanged.

The relay itself has two shapes. Poll the table, which is ordinary code and what most teams should
write. Or tail the database's own log, which is transaction log tailing: "Tail the database transaction
log and publish each message/event inserted into the outbox to the message broker", using the MySQL
binlog, the Postgres WAL or DynamoDB streams. The second buys lower latency and no polling load, and
costs you an operational dependency that understands your database's replication protocol.

## Worked example

```sql
CREATE TABLE outbox (
  id            bigserial PRIMARY KEY,
  aggregate_id  text        NOT NULL,   -- '4821'
  type          text        NOT NULL,   -- 'order.paid'
  payload       jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);
```

The handler writes both, or neither:

```ts
await db.transaction(async (tx) => {
  const [order] = await tx.insert(orders).values(input).returning();
  await tx.insert(outbox).values({
    aggregateId: String(order.id),
    type: 'order.paid',
    payload: order,
  });
});
// Nothing after this line is allowed to be load-bearing.
```

The relay is a separate process, and the message id is the outbox id:

```ts
const batch = await db
  .select()
  .from(outbox)
  .where(isNull(outbox.publishedAt))
  .orderBy(outbox.id)
  .limit(100);

for (const row of batch) {
  await broker.publish(row.type, row.payload, { messageId: String(row.id) });
  await db.update(outbox).set({ publishedAt: new Date() }).where(eq(outbox.id, row.id));
}
```

Publishing before marking, never the reverse. Crash between the two and the row is still unpublished,
so the next pass sends it again with the same `messageId`, and a consumer that has recorded that id
does nothing. That is the duplicate the design chose, arriving where somebody is ready for it.

## Traps

**"We retry the publish if it fails."** That covers the case you were already handling, which is the
broker returning an error. It does nothing for the case that actually loses data, where the process
holding the retry loop is the thing that died. Any repair that lives after the commit, in the same
process, is the original bug with more code in front of it. The test to apply: if this process
disappeared entirely at this line, what reconciles?

**The relay published event 102 before event 101.** Measured on PostgreSQL 17.10: two concurrent
transactions insert into the outbox, the one that took id 1 commits four seconds after the one that
took id 2, and a relay polling `WHERE published_at IS NULL ORDER BY id` in between sees only id 2 and
publishes it. Id 1 appears afterwards and goes out second. Sequences hand out values at insert time
and are non-transactional, so id order is insertion order and never commit order. Ordering only holds
per aggregate, which is why the message carries `aggregate_id` and consumers that care about sequence
should partition on it rather than trusting global order. AWS lists this as its own consideration,
which is that events go "in the same order in which the service updates the database".

**The search index is missing last Tuesday, and nobody here runs a message broker.** This is the same
problem wearing clothes people do not recognise. Writing to Postgres and then to Elasticsearch is a
dual write. So is writing to Postgres and then setting a key in Redis, and so is committing a row and
then calling a payment provider. The broker vocabulary makes it look like a distributed-systems
concern belonging to somebody with more services than you have, and the criterion is much smaller: two
systems, one logical change, no shared transaction. Where the second system is a derived read model, a
cache or an index, there is a cheaper answer than an outbox, which is to make it rebuildable and
rebuild it on a schedule. Drift you can repair on a cron is a different class of problem from drift
you cannot detect.
