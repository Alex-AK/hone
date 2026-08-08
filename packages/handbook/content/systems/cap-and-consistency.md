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

## The model

A partition is not a design choice. A link between two datacentres drops, or a switch starts losing
packets between two racks, and now some nodes cannot reach others while requests keep arriving at
both sides. Nobody picked that. On a real network with more than one machine on it, it happens
eventually, which is why partition tolerance is not the third item on a menu: it is the condition
under which the other two get tested.

So the only live question during a partition is what a node does with a request it cannot confirm
with the other side. There are two answers.

- **Refuse** — the node will not serve what it cannot verify is current. The caller gets an error or
  a wait. Nobody reads a wrong value, and some people read nothing.
- **Answer anyway** — the node serves what it holds, which may be behind, and takes writes the other
  side cannot see. Everybody gets a response, and the two sides can now disagree about the same row.

That is all of CAP: while partitioned, consistency or availability, one or the other. The familiar
"pick two of three" phrasing is what makes it sound larger than it is. Eric Brewer, twelve years
after proposing it, says the formulation "was always misleading because it tended to oversimplify
the tensions among properties", and that it "prohibits only a tiny part of the design space: perfect
availability and consistency in the presence of partitions, which are rare". With the network
healthy you can have both, and almost always do.

**PACELC** names the trade you are making the rest of the time. Daniel Abadi's formulation: "if
there is a partition (P) how does the system tradeoff between availability and consistency (A and
C); else (E) when the system is running as normal in the absence of partitions, how does the system
tradeoff between latency (L) and consistency (C)?" The else branch is the one that bills you on
every single request, because a read guaranteed to be current has to be answered by the leader or
confirmed by a quorum, and that is a round trip you would otherwise skip. It is also the branch
people forget they are on, since it is usually set by a default rather than by a decision.

Four points on that scale, and you will meet all four.

- **Strong** — every read reflects the most recent write, whichever replica answered it. MongoDB's
  `linearizable` read concern states the price: the query "may wait for concurrent writes to
  propagate to a majority of replica set members before returning results".
- **Read-your-writes** — a session always sees its own writes. It may still be missing everyone
  else's.
- **Monotonic reads** — a session never watches time run backwards. Once it has seen a value, a
  later read will not show an older one.
- **Eventual** — the write is accepted and will reach every replica, and nothing promises which read
  is the first to see it.

The middle two are session guarantees, and they are why most products never need the top one.
[Replication](./replication.md) introduces both through the symptoms that produce them, and covers
the two ways to buy them.

**The C in CAP is not the C in ACID.** Brewer, again: "In ACID, the C means that a transaction
preserves all the database rules, such as unique keys. In contrast, the C in CAP refers only to
single-copy consistency, a strict subset of ACID consistency." A database can enforce every
constraint you declared and still hand you a row from a replica that is a second behind. The two
words are answering different questions, and "we need ACID" settles nothing about which side of a
partition you want to be on.

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

Which of those two you get is not a property of the database so much as a setting on the call.
Cassandra "supports a per-operation tradeoff between consistency and availability through Consistency
Levels", built on Dynamo's `R + W > N` rule, so with a replication factor of 3:

```
QUORUM   2 of the 3 replicas must answer   a side that can reach only 1 gets no answer
ONE      1 replica answers                 whichever copy is reachable, possibly behind
```

Same table, same row, two different points on the trade, chosen per statement.

## Traps

**Someone said we should use an AP database.** CP and AP as permanent labels on a product are mostly
marketing, because the knob is on the operation rather than the database. Cassandra sets a
consistency level per request, DynamoDB takes a `ConsistentRead` parameter on `GetItem`, `Query` and
`Scan`, and MongoDB takes a read concern and a write concern per operation. The question worth
asking is not which letter the database is, it is which letter this endpoint needs: the balance
check and the avatar do not need the same one.

**Nothing was partitioned and the read still came back stale.** That is PACELC's else branch, and
you are on it every day. Asynchronous replication trades consistency for latency on every request,
and the default is usually the fast side: DynamoDB reads are eventually consistent unless you ask
otherwise, and MongoDB's default read concern is `local`, which "returns data from the instance with
no guarantee that the data has been written to a majority of the replica set members". CAP had
nothing to do with it.

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
lands minutes after the incident looked over. Last-writer-wins is not the absence of that bill: it
is a decision to drop one of the two writes, quietly. [Replication](./replication.md) covers where
this comes from.
