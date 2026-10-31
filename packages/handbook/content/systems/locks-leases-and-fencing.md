---
title: Locks, leases and fencing
question: Two workers both thought they held the lock. How?
order: 20
practise:
  - sys-lease-outlived-the-work
  - sys-fencing-token
  - sys-lock-release-deletes-another
  - sys-two-primaries-after-a-blip
  - sys-majority-of-six
sources:
  - author: Martin Kleppmann
    title: How to do distributed locking
    url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
  - author: Redis
    title: Distributed Locks with Redis
    url: https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/
  - author: Mike Burrows
    title: The Chubby lock service for loosely-coupled distributed systems
    url: https://research.google.com/archive/chubby-osdi06.pdf
  - author: Diego Ongaro and John Ousterhout
    title: In Search of an Understandable Consensus Algorithm (Extended Version)
    url: https://raft.github.io/raft.pdf
  - author: PostgreSQL
    title: Advisory Lock Functions
    url: https://www.postgresql.org/docs/current/functions-admin.html
verified: 2026-09-27
---

Workers on different machines take a lock when only one of them may do a job at a time. Across a
network the lock has to expire on its own, or a worker that crashed would hold it forever. That
expiry is the catch: a worker that stalls for a moment can wake up still believing the lock is its
own, after somebody else has taken it.

## The model

A lock across machines is a lease: it expires. It has to, because a holder that crashes would
otherwise hold it forever. Kleppmann puts the cost of that in one sentence: "if the GC pause lasts
longer than the lease expiry period, and the client doesn't realise that it has expired, it may go
ahead and make some unsafe change."

That sentence is the whole problem. The holder cannot know its lease ran out, because the thing that
made it run out is the holder not running. Checking the lease just before writing does not close the
gap, since the pause can land between the check and the write. A garbage-collection pause, a slow
query, a stalled network: anything that stops the process for longer than the lease hands the lock to
someone else while the first holder still believes it has it.

So a lock on its own cannot promise that only one writer touches the resource. **The resource has to
take part.** A fencing token is "a number that increases (e.g. incremented by the lock service) every
time a client acquires the lock". Every write carries the token, and the resource remembers the
highest one it has accepted and refuses anything lower. Google's Chubby calls the same thing a
sequencer, carrying "the lock generation number", and a server handed a stale one "should reject the
request".

Which leaves the question of what kind of lock you have, and Kleppmann's split is the one to use:

- **A lock for efficiency** stops two workers doing the same job twice. A duplicate costs some compute
  and nothing else. A single Redis key set with `NX` and an expiry is enough, and the occasional
  double run is the accepted price.
- **A lock for correctness** stops two workers corrupting the same data. Here the lease alone is not
  enough. Fence the write, or make the work idempotent so a second run cannot do damage.

Underneath both sits a harder question: who decides who holds the lock, when the decider can fail too?
One node is a single point of failure, and a Redis primary with a replica is not a fix, because Redis
replication is asynchronous and a failover can promote a replica that never saw the lock. The answer
is consensus. In Raft a leader needs votes "from a majority of the servers in the full cluster for the
same term", and each server votes once per term, so at most one leader exists per term. Terms only go
up, and "if a server receives a request with a stale term number, it rejects the request". The term is
a fencing token built into the protocol. Five servers tolerate two failures, and the minority side of
a partition can never gather a majority, which is what stops it electing a second leader. Chubby and
ZooKeeper are services built on this, and you use one rather than write one.

## Worked example

Kleppmann's timeline, with the storage doing the check:

```
worker 1   acquires the lease          token 33
worker 1   pauses (GC) ............................ lease expires
worker 2   acquires the lease          token 34
worker 2   writes with 34              storage: highest seen is now 34, accepted
worker 1   wakes, writes with 33       storage: 33 < 34, rejected
```

Worker 1 was wrong about holding the lock and nothing it believed mattered, because the storage made
the decision. Where the resource is a row, the check is one `WHERE` clause, the same shape as a version
column:

```sql
UPDATE reports
   SET body = ?, fence = ?
 WHERE id = ? AND fence <= ?;
-- 0 rows: a holder with a newer token has already written. Stop.
```

Postgres also has a lock that avoids the expiry problem for a single database:
`pg_try_advisory_lock(key)` "will either obtain the lock immediately and return `true`, or return
`false` without waiting", and a session-level advisory lock "is held until explicitly released or the
session ends". There is no timer to outrun. The lock lives exactly as long as the connection, so a
worker that pauses still holds it, and one whose connection dies loses it.

## Traps

**The nightly job ran twice, and both instances logged that they had the lock.** The first run took
longer than the lease, so the lease expired mid-run and the second instance acquired it fairly. A
longer lease or a renewal loop shrinks the window without closing it. If a double run is only waste,
accept it. If it corrupts something, fence the write or make the job idempotent.

**A slow run finished, released its lock, and a third worker started while the second was still
going.** The release was a plain `DEL`. The first worker's lease had already expired and passed to the
second, so the `DEL` deleted the second worker's lock. Redis's own guidance is to set the key to a
value unique to each acquisition and delete it only if it still holds that value: `DELEX key IFEQ
value` on Redis 8.4, or a short Lua script that compares before deleting on anything older.

**After a network blip, both database nodes were accepting writes as primary.** Two nodes watching each
other's heartbeat cannot tell a dead peer from an unreachable one, so each promoted itself. That is
split brain, and adding a smarter heartbeat does not fix it. Require a majority to act as leader, which
needs at least three voters, and have the old leader's writes carry its term so anything that has seen
a newer one refuses them.
