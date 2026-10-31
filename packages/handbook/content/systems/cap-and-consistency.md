---
title: CAP, and what consistency actually means
question: The datacentres cannot talk to each other. What am I actually choosing between?
order: 9
practise:
  - sys-cap-theorem
  - sys-strong-vs-eventual-consistency
sources:
  - author: Eric Brewer
    title: 'CAP Twelve Years Later: How the "Rules" Have Changed'
    url: https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/
  - author: Daniel Abadi
    title: Problems with CAP, and Yahoo's little known NoSQL system
    url: https://dbmsmusings.blogspot.com/2010/04/problems-with-cap-and-yahoos-little.html
  - author: Daniel Abadi
    title: Consistency Tradeoffs in Modern Distributed Database System Design
    url: https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf
  - author: Apache Cassandra
    title: Dynamo, and tunable consistency
    url: https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html
  - author: AWS
    title: DynamoDB read consistency
    url: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html
  - author: MongoDB
    title: Read Concern
    url: https://www.mongodb.com/docs/manual/reference/read-concern/
  - author: MongoDB
    title: Write Concern
    url: https://www.mongodb.com/docs/manual/reference/write-concern/
  - author: Donne Martin
    title: System Design Primer
    url: https://github.com/donnemartin/system-design-primer
  - author: Martin Kleppmann
    title: Designing Data-Intensive Applications
    url: https://dataintensive.net/
verified: 2026-08-01
---

When servers in different places lose contact with each other, each one still gets requests it
cannot check with the others. It can refuse them, or answer with what it has and risk being out of
date. The CAP theorem names that choice, and it is a smaller and more specific choice than its
reputation suggests.

## The model

CAP is one decision, made only while the network is split: a node that cannot reach the others
either refuses a request or answers with what it holds.

The split is something that happens to you. A link between two datacentres drops, or a switch starts
losing packets between two racks, and some nodes cannot reach others while requests keep arriving
on both sides. On a real network with more than one machine it happens eventually, so partition
tolerance is not the third item on a menu: it is the condition under which the other two get tested.

So during a partition the only live question is what a node does with a request it cannot confirm
with the other side. There are two answers.

- **Refuse** — the node will not serve what it cannot verify is current. The caller gets an error or
  a wait. Nobody reads a wrong value, and some people read nothing.
- **Answer anyway** — the node serves what it holds, which may be behind, and takes writes the other
  side cannot see. Everybody gets a response, and the two sides can now disagree about the same row.

While partitioned, it is consistency or availability. The familiar "pick two of three" phrasing
makes it sound larger than it is. Eric Brewer, twelve years after proposing it, calls that
formulation misleading and says it "prohibits only a tiny part of the design space: perfect
availability and consistency in the presence of partitions, which are rare". With the network
healthy you can have both, and almost always do.

**PACELC** names the trade you make the rest of the time. Daniel Abadi's formulation asks two
questions: during a partition, how the system trades availability against consistency, and else,
when it is running normally, how it trades latency against consistency. The else branch bills you on
every request, because a read guaranteed to be current has to be answered by the leader or confirmed
by a quorum, a round trip you would otherwise skip. It is also the branch people forget they are on,
since a default usually sets it rather than a decision.

Four points on that scale, and you will meet all four.

- **Strong** — every read reflects the most recent write, whichever replica answered it. MongoDB's
  `linearizable` read concern states the price: the query may wait for concurrent writes to reach a
  majority of replica set members before it returns.
- **Read-your-writes** — a session always sees its own writes. It may still be missing everyone
  else's.
- **Monotonic reads** — a session never watches time run backwards. Once it has seen a value, a
  later read will not show an older one.
- **Eventual** — the write is accepted and will reach every replica, and nothing promises which read
  is the first to see it.

The middle two are session guarantees, and they are why most products never need the top one.
[Replication](./replication.md) introduces both through the symptoms that produce them, and covers
the two ways to buy them.

**The C in CAP is not the C in ACID.** Brewer again: "In ACID, the C means that a transaction
preserves all the database rules, such as unique keys. In contrast, the C in CAP refers only to
single-copy consistency, a strict subset of ACID consistency." A database can enforce every
constraint you declared and still hand you a row from a replica that is a second behind, so "we need
ACID" settles nothing about which side of a partition you want to be on.

## Worked example

One partition, one read, answered both ways.

```
09:41:02  the link between eu-west and us-east drops
          both regions keep taking traffic; neither can see the other

09:41:04  PUT /accounts/7  { limit: 5000 }   → eu-west   accepted, not replicated
09:41:09  GET /accounts/7                    → us-east   this region still holds 2000

consistency first
          us-east cannot confirm it holds the latest write
          503, or a read that waits on a quorum it cannot reach
          nobody sees the wrong limit; nobody in us-east sees anything

availability first
          us-east answers { limit: 2000 }
          a stale answer, indistinguishable from a fresh one
          a write here leaves two versions of account 7

09:47:30  the link is back
          consistency:  us-east catches up; the refused requests were the whole bill
          availability: 2000 and 5000 both exist, and something has to pick one
```

Which of those two you get is less a property of the database than a setting on the call. Cassandra
supports a per-operation trade between consistency and availability through consistency levels,
built on Dynamo's `R + W > N` rule, so with a replication factor of 3:

```
QUORUM   2 of the 3 replicas must answer   a side that can reach only 1 gets no answer
ONE      1 replica answers                 whichever copy is reachable, possibly behind
```

Same table, same row, two different points on the trade, chosen per statement.

## Traps

**Someone said we should use an AP database.** CP and AP as permanent labels on a product are mostly
marketing, because the knob is on the operation rather than the database. Cassandra sets a
consistency level per request, DynamoDB takes a `ConsistentRead` parameter on `GetItem`, `Query` and
`Scan`, and MongoDB takes a read concern and a write concern per operation. Ask which letter this
endpoint needs rather than which letter the database is: the balance check and the avatar do not
need the same one.

**Nothing was partitioned and the read still came back stale.** That is PACELC's else branch, and
you are on it every day. Asynchronous replication trades consistency for latency on every request,
and the default is usually the fast side: DynamoDB reads are eventually consistent unless you ask
otherwise, and MongoDB's default read concern is `local`, which returns the instance's data with no
guarantee that a majority of the replica set has it.

**We chose consistency, and users got a hang rather than an error.** Refusing to answer only helps
if it refuses fast. A read waiting for a quorum it cannot reach holds its connection until something
gives up, and callers pile in behind it, so one region's partition arrives at your service as
exhausted capacity. Put a deadline on the call, which is
[failure and retries](../server-runtime/failure-and-retries.md), and a
[circuit breaker](./circuit-breakers.md) around it so the second thousand requests do not repeat the
first thousand's wait.

**The partition healed and there are two versions of the same row.** Both sides stayed available and
both took writes, and nothing orders those writes against each other, because ordering is what a
single writer was buying you. Reconciliation is the deferred bill for choosing availability, and it
lands minutes after the incident looked over. Last-writer-wins does not avoid that bill: it is a
decision to drop one of the two writes, quietly. [Replication](./replication.md) covers where this
comes from.
