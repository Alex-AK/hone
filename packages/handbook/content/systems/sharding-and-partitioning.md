---
title: Sharding and partitioning
question: The table no longer fits on one machine. How do I split it, and what breaks when I do?
order: 10
practise:
  - sys-sharding-partitioning
sources:
  - author: PostgreSQL
    title: Table Partitioning
    url: https://www.postgresql.org/docs/current/ddl-partitioning.html
  - author: MongoDB
    title: Shard Keys
    url: https://www.mongodb.com/docs/manual/core/sharding-shard-key/
  - author: MongoDB
    title: Reshard a Collection
    url: https://www.mongodb.com/docs/manual/core/sharding-reshard-a-collection/
  - author: AWS
    title: Best practices for designing and using partition keys effectively in DynamoDB
    url: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html
  - author: AWS
    title: Using write sharding to distribute workloads evenly in your DynamoDB table
    url: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-sharding.html
  - author: Vitess
    title: Vindexes
    url: https://vitess.io/docs/reference/features/vindexes/
  - author: Donne Martin
    title: System Design Primer
    url: https://github.com/donnemartin/system-design-primer
  - author: Martin Kleppmann
    title: Designing Data-Intensive Applications
    url: https://dataintensive.net/
verified: 2026-08-01
---

## The model

One table's rows, split into pieces by a key, each row living in exactly one piece. Fix the
vocabulary first, because two words describe the same idea at two scales.

**Partitioning** usually means the pieces sit inside one database instance. PostgreSQL calls them
partitions of a partitioned table, and the table still behaves like a table: one query, one planner,
one transaction. What you buy is a smaller index per piece, dropping a month of data
with a `DROP TABLE` instead of a long `DELETE`, and partition pruning, which lets the planner skip
the pieces that cannot hold a matching row.

**Sharding** means the pieces sit on separate machines behind separate connections. That is the only
version that moves a write ceiling, because a follower is a full copy and applies every write
anyway: [replication](./replication.md) buys read throughput and redundancy, splitting buys write
throughput. It is also the version where the database stops answering anything that spans the split.

The two words are not used consistently. DynamoDB says partition key, and its partitions are
physical units with their own ceilings, documented at 3,000 read units and 1,000 write units per
second each. Read the mechanism rather than the word: the question is always whether a piece is a
separate machine.

Three ways to decide which piece a row belongs to.

- **Range** — contiguous spans of the key, one span per piece. Ordered work stays cheap, because
  neighbouring keys are neighbours on disk: a `BETWEEN`, a scan in key order, a last-7-days filter,
  each reads one piece or a few adjacent ones. The cost is that load follows the key's distribution,
  and a key that increases with time points every new write at the last piece.
- **Hash** — hash the key, and the hash picks the piece. Postgres does it by "specifying a modulus
  and a remainder for each partition". The spread is even without you designing for it. The cost is
  that ordering is gone: the hash of a date says nothing about which dates are near it, so a range
  predicate cannot rule out a single piece and has to read all of them. Adding a piece is its own
  problem, because changing the number of buckets rehomes almost every row:
  [consistent hashing](./consistent-hashing.md) is the answer to that one.
- **Directory** — a lookup table maps the key to its piece. Vitess builds this in as a lookup
  vindex, which "creates and stores associations between column values and keyspace IDs". You get
  flexibility the other two cannot give you: move one tenant, put one enormous customer on its own
  machine, split a hot piece without touching the rest. The cost is that the lookup is on the path of
  every query and is now a dependency to keep alive, cache, and keep true.

Once the pieces are separate machines, four things stop being the database's problem and become
yours: a join across the split, an aggregate across the split, a unique constraint across the split,
and a transaction across the split. The first two turn into fan-out plus a merge you write. The
other two need a protocol, or a design that never asks for them.

## Worked example

The split from the paired problem: users across four databases by user ID range.

```
shard key: user_id, range sharded across four databases

  db0   user_id        1 to   250,000
  db1            250,001 to   500,000
  db2            500,001 to   750,000
  db3            750,001 to 1,000,000

  WHERE user_id = 481207                      one shard, exactly as before
  WHERE user_id BETWEEN 400000 AND 410000     one shard, because the key is ordered
  GROUP BY product_id                         all four, and the merge is yours
```

The merge is where the work went, and not every merge is equally easy.

```js
// Top 10 users by orders. Each shard's own top 10 is enough, because the shard
// key is the thing being ranked: a user's rows are all on one machine.
const perShard = await Promise.all(shards.map((s) => s.query(TOP_10_USERS)));
const top10 = perShard.flat().sort(byOrders).slice(0, 10);

// This one does not compose. Every shard sees some of the same products, so the
// four counts overlap and adding them overcounts.
//   SELECT count(DISTINCT product_id) FROM orders
```

Which aggregates survive is a property of the aggregate. Sum, count, min and max build from partial
results, and so does top-N when the shard key is the thing being ranked. Count-distinct, median and
percentiles need the raw values in one place. `OFFSET` does not survive either, because page 6 of
the merged list is not page 6 of any shard, so paging across shards means over-fetching from every
one of them. A cursor is the version that stays cheap, and
[pagination at the database](../databases/pagination-at-the-database.md) has the shape of it.

## Traps

**The shard key is wrong and changing it is a data migration, not a config change.** Every row's
machine is a function of that key, so a new key means rewriting the whole dataset while it serves
traffic. MongoDB puts a number on the room to clear first: storage on each recipient shard of at
least `((collection_storage_size + index_size) * 2) / shard_count`. Pick the key from the query you
run most, which is usually everything for one user, and then treat it as close to permanent.

**A report that took 200ms takes 6 seconds, and one of its numbers is wrong.** It crosses the split,
so it is four queries plus a merge, and it finishes at the speed of the slowest shard. The wrong
number is the merge: `count(DISTINCT ...)` on anything other than the shard key double-counts,
because the same value appears on several shards. A join across the split has no server-side version
at all; you fetch both sides and join in application code.

**One shard sits at 90% CPU and the other three are idle.** The key is skewed. Range sharding does
it structurally whenever the key increases with time, since every new row targets the last shard.
Hash sharding does it when one key value is genuinely enormous, because hashing spreads keys and the
celebrity account is one key. The fix is to widen the key space rather than rebalance: AWS's
write-sharding guidance appends a suffix to the partition key, turning one hot value into 200 of
them in its own worked example, and charges you on the read, which now queries all 200 and merges.

**Two rows share an email address and the unique index never fired.** Uniqueness is enforced per
machine, and each shard's row is unique as far as that shard can see. PostgreSQL states the same
constraint where it can still enforce it, requiring that a unique constraint's "columns must include
all of the partition key columns"; across separate databases, nobody is enforcing it at all. Global
uniqueness needs something outside the shards, usually a small table keyed by the value itself. The
same boundary is why a transaction spanning two shards is two transactions, and one of them can
commit while the other does not.
