---
title: What an ack promises
question: The write returned success. Success against which failure?
order: 18
practise:
  - sys-ack-durability-ladder
  - sys-replica-lag
  - sys-leader-follower-replication
  - sys-ack-after-work
  - sys-message-delivery-semantics
sources:
  - author: PostgreSQL
    title: 'Server Configuration: Write Ahead Log'
    url: https://www.postgresql.org/docs/current/runtime-config-wal.html
  - author: Apache Kafka
    title: Design
    url: https://github.com/apache/kafka/blob/trunk/docs/design/design.md
  - author: PostgreSQL
    title: 'Log-Shipping Standby Servers: Replication Slots'
    url: https://www.postgresql.org/docs/current/warm-standby.html
verified: 2026-08-08
---

Measured against PostgreSQL 17.10. Kafka behaviour is quoted from its design documentation.

## The model

"Durable" is not a property. It is a relation between your data and a failure you named, and an
acknowledgement is a claim about how far up this ladder the bytes got:

```
 1  the client library has it in a buffer         survives nothing
 2  the server process has it in memory           survives a client crash
 3  the server called write(2), the OS has it     survives the process dying
 4  the bytes are flushed to durable storage      survives the power going out
 5  N other machines have it, flushed             survives losing that machine
 6  N machines have applied it and will serve it  survives it, and reads agree
```

Nobody ships level 6 by default, because each rung costs a round trip somebody has to wait for. Every
system you use is a configuration sitting somewhere on this ladder, usually around 4, and the
vocabulary differs while the ladder does not.

**Postgres.** `synchronous_commit` is the dial. `off` is roughly rung 3: "there is no waiting, so there
can be a delay between when success is reported to the client and when the transaction is later
guaranteed to be safe against a server crash", bounded at "three times `wal_writer_delay`". Everything
that is not `off` waits for rung 4, since "the local behavior of all non-off modes is to wait for local
flush of WAL to disk". With a synchronous standby configured, `remote_write` means the standby
"received the commit record ... and written it to their file systems", `on` means it "flushed it to
durable storage", and `remote_apply` means it has been "applied, so that it has become visible to
queries on the standby". That is rungs 3, 5 and 6, named.

**Kafka.** `acks` is the same dial. Committed means "all replicas in the in-sync replicas (ISR) for
that partition have applied it to their log", and the producer chooses how much of that to wait for:
`acks=0` does not wait, `acks=1` waits for the leader alone, `acks=all` waits for the current ISR.

The cost is a real number rather than a shrug. 2,000 individual commits, measured:

```
synchronous_commit = on     178.0 ms      89 µs per commit
synchronous_commit = off      5.5 ms     2.7 µs per commit
```

**32x**, and all of it is the wait for the WAL flush. That is the price of rung 4, and it is why the
setting exists rather than being a mistake nobody has fixed. Which is also the useful way to make this
decision: it is per transaction rather than per system, `synchronous_commit` is settable per session,
and a table of analytics events and a table of payments do not need the same rung.

## Worked example

Set the rung where the value of the write is decided, not globally:

```sql
-- Recording a page view. Losing the last few on a crash is not an incident.
SET LOCAL synchronous_commit = off;
INSERT INTO page_view (path, at) VALUES ($1, now());
```

```sql
-- Taking money. This one waits.
SET LOCAL synchronous_commit = on;   -- or remote_apply, with a synchronous standby
INSERT INTO payment (account_id, cents, idempotency_key) VALUES ($1, $2, $3);
```

`SET LOCAL` scopes it to the transaction, which matters because a connection pool hands the same
session to the next request and a plain `SET` would leak the weaker setting into somebody's payment.

## Traps

**We set `acks=all` and still lost messages.** `acks=all` waits for the in-sync replica set, and the
in-sync replica set is however many replicas are currently keeping up, which can be one. Kafka's docs
say it outright: "if a topic is configured with only two replicas and one fails (i.e., only one in sync
replica remains), then writes that specify `acks=all` will succeed. However, these writes could be lost
if the remaining replica also fails." The setting that makes the promise mean what people read it as is
`min.insync.replicas`, which refuses the write when the ISR is too small: durability and availability,
and choosing one is choosing against the other. `acks=all` alone buys availability.

**Somebody turned off `synchronous_commit` and we were afraid of corruption.** Wrong knob. Postgres
distinguishes these carefully and it is worth getting right, because the safe optimisation and the
dangerous one sit two paragraphs apart in the same document. Turning off `fsync` "can result in
unrecoverable data corruption in the event of a power failure or system crash". Turning off
`synchronous_commit` cannot: "Unlike fsync, setting this parameter to off does not create any risk of
database inconsistency: an operating system or database crash might result in some recent
allegedly-committed transactions being lost, but the database state will be just the same as if those
transactions had been aborted cleanly." Losing the last few transactions and having a database that
lies to you are different orders of problem. The first is a decision you can make per table.

**The replica acknowledged, so the read-after-write will work.** Received, flushed and applied are
three different rungs, and only the top one means a query on that replica can see the row. This is why
`remote_apply` exists and why Postgres warns it "will cause much larger commit delays than previous
settings since it waits for WAL replay". If you are routing reads to a replica and a user expects to
see what they just wrote, the fix is usually not a stronger ack for every write: it is routing that
user's reads to the leader for a bounded window, because paying replay latency on every commit to fix
one screen is the expensive way round.
