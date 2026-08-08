---
title: Replication
question: There is a second copy of the database. What is now true that was not before?
order: 8
practise:
  - sys-leader-follower-replication
  - sys-replica-lag
sources:
  - author: PostgreSQL
    title: Log-Shipping Standby Servers
    url: https://www.postgresql.org/docs/current/warm-standby.html
  - author: PostgreSQL
    title: Monitoring Database Activity
    url: https://www.postgresql.org/docs/current/monitoring-stats.html
  - author: MongoDB
    title: Causal Consistency and Read and Write Concerns
    url: https://www.mongodb.com/docs/manual/core/causal-consistency-read-write-concerns/
  - author: AWS
    title: DynamoDB global tables
    url: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GlobalTables.html
  - author: Donne Martin
    title: System Design Primer
    url: https://github.com/donnemartin/system-design-primer
  - author: Martin Kleppmann
    title: Designing Data-Intensive Applications
    url: https://dataintensive.net/
verified: 2026-08-01
---

## The model

One leader, several followers. Writes go to the leader only. It appends every change to a log and
streams that log out; the followers replay it in order and serve reads. A single writer is what
makes ordering free, because the leader decides the sequence and nobody else gets an opinion.

Three things are true from the moment the second copy exists.

**A read can be answered by a machine that has not seen your last write.** How far behind a follower
is happens to be measurable rather than a feeling: Postgres reports each standby's `replay_lsn`, the
last log location it has replayed, and `replay_lag` in `pg_stat_replication` on the primary.

**Losing the leader is now a decision.** Failover means promoting a follower, and followers are not
equally caught up. Promote the one furthest along in the log, because promoting any other discards
the writes it had not replayed yet.

**Write capacity is unchanged.** Every follower applies every write, so replicas buy read throughput
and redundancy and nothing else. A database that is out of write headroom needs partitioning.

The knob governing the rest is when the leader may call a write committed. Postgres streaming
replication is asynchronous by default, and the docs state the price: "If the primary server crashes
then some transactions that were committed may not have been replicated to the standby server,
causing data loss." Synchronous replication makes each commit wait for a standby to confirm, and
"the minimum wait time is the round-trip time between primary and standby". That is the choice, and
it is a choice about what you would rather lose: milliseconds on every write, or the last seconds of
writes on the one failover you were not expecting.

**Multi-leader** takes writes in more than one place, which keeps a region writable while it cannot
reach the others and hands you two versions of the same row: DynamoDB global tables default to
exactly this, with "multi-Region writes, asynchronous replication, last-writer-wins conflict
resolution". **Leaderless** drops the special node entirely and asks a quorum of replicas on every
read and write, buying availability at the price of reconciling divergence yourself.

## Worked example

The lag reaching application code, on a timeline:

```
t+0ms    POST /comments       → leader       committed at LSN 0/3A21F08
t+3ms    302 → /threads/91
t+6ms    GET  /threads/91     → follower B   replayed as far as 0/3A21E40
                                             the comment is not in this copy yet
t+900ms  follower B replays 0/3A21F08
t+4s     the user refreshes   → follower B   the comment is there
```

Nothing failed. The write is durable on the leader, the redirect outran replication, and the user is
looking at a page missing the thing they just did. The guarantee that removes this case, and only
this case, is read-your-writes: a session sees its own writes, whatever else it may not see yet.

Two ways to get it, and the difference is what you track.

- **Route to the leader for a window** — after a session writes, send that session's reads to the
  leader for the next few seconds. One flag on the session, no coordination, paid for in leader read
  load, with a window length that is a guess.
- **Track the write position** — keep the log position the write landed at, and require the replica
  serving the next read to have replayed at least that far. In Postgres that position is an LSN.
  MongoDB packages the idea as causally consistent sessions, which its docs list as providing "Read
  own writes" and "Monotonic reads" given the right read and write concerns. More bookkeeping, and
  the read still goes to a replica.

## Traps

**The comment posts, the thread loads without it, and a refresh shows it.** Replica lag: the write
went to the leader, the read after the redirect went to a follower that had not replayed it yet. Fix
it with read-your-writes for that one session, not by sending every read to the leader, which throws
away the reason the replicas are there.

**Failover ran cleanly and the last few seconds of writes are gone.** Asynchronous replication
acknowledges a write before any follower holds it, so whatever was in flight when the leader died
exists nowhere else. Promoting the most caught-up follower minimises that loss; it cannot make it
zero. Bounding it is what synchronous replication is for, and you pay for it on every commit rather
than on the rare failover.

**A count goes up on one page load and back down on the next.** Two reads, load-balanced across two
followers at different positions, so the second was served by the one further behind and time
appears to run backwards. The guarantee is monotonic reads, and the cheap way to get it is to pin a
session to one replica instead of picking a fresh one per request.

[CAP, and what consistency actually means](./cap-and-consistency.md) puts both of these session
guarantees beside strong and eventual consistency.
