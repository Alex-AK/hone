---
title: Consistent hashing
question: Why does adding one cache server empty almost the whole cache?
order: 11
practise:
  - sys-consistent-hashing
sources:
  - author: David Karger et al., MIT
    title: 'Consistent Hashing and Random Trees: Distributed Caching Protocols for Relieving Hot Spots on the World Wide Web'
    url: https://people.csail.mit.edu/karger/Papers/web.pdf
  - author: Giuseppe DeCandia et al., Amazon
    title: "Dynamo: Amazon's Highly Available Key-value Store"
    url: https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf
  - author: Apache Cassandra
    title: Dynamo
    url: https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html
  - author: Redis
    title: Redis cluster specification
    url: https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/
  - author: Donne Martin
    title: System Design Primer
    url: https://github.com/donnemartin/system-design-primer
  - author: Martin Kleppmann
    title: Designing Data-Intensive Applications
    url: https://dataintensive.net/
verified: 2026-08-01
---

When data is spread across several cache servers, something has to decide which server holds each
item. The obvious rule depends on how many servers there are, so adding one sends almost every
request to the wrong place and the cache suddenly looks empty. Consistent hashing is a rule that
moves only a small share of the items when a server joins or leaves.

## The model

Consistent hashing ties a key's server to the key and to each server's identity, never to how many
servers exist, so adding or removing one moves only a small slice of the keys.

Compare the rule it replaces. `server = hash(key) % n` ties a key's home to the current value of n.
Change n by one and the remainder changes for nearly every key, so nearly every lookup goes to a
machine that has never held that key. Nothing expired or was evicted; the old entries sit on servers
nobody is asking. The hit rate falls to roughly zero, and the database absorbs the entire read load,
from a deploy meant to reduce load.

Consistent hashing takes n out of the calculation. Hash the servers as well as the keys, into the
same output space, and treat that space as a circle where the largest value wraps back to zero. A
key belongs to the first server clockwise from its own position. A key's position depends on the key
alone, and a server's on that server's identity alone.

So adding a server changes the owner of exactly one arc, the keys lying between the new server's
position and the next server counterclockwise from it, and every key outside that arc keeps its
owner. Removing a server hands its arc to its clockwise neighbour and touches nothing else.

With `% n`, a key keeps its server only by coincidence, so close to all K keys move. On a ring,
adding or removing a server moves about K/n keys. That K/n is an average over where the positions
happened to fall, not a bound, and it is only as good as the spread of those positions.

**Virtual nodes** are what make the spread good, so they are not an optimisation to leave for later.
With one position per server, the arcs come out at whatever lengths the hash gives them, so a
server's share of the ring is random rather than equal, and a single successor inherits all of a
departing server's traffic and working set. Give each physical server many positions instead: its
share becomes the sum of many small arcs, which evens out, and its departure is absorbed by many
neighbours rather than one. Cassandra's virtual nodes assign each physical node multiple tokens on
the ring, so a new node takes roughly equal amounts of data from the others. One position is nowhere
near enough: Cassandra's docs record that choosing tokens at random needed a default as high as 256
per node, and that the deterministic allocator added in 3.x reaches the same balance with far fewer.

This belongs anywhere a node holds state for a key: a cache tier, and the partitioning layer of a
hash-partitioned datastore. Amazon's Dynamo paper says its partitioning relies on consistent hashing
to spread load across storage hosts, and the Karger paper that named the technique was written about
web caches in the first place.

It does not belong in a load balancer choosing between stateless application servers. Nothing is
stored on those instances, so no request is cheaper for having landed on the same one, and round
robin or least-connections spreads work better. [Load balancers](./load-balancers.md) covers what
hashing at that layer buys, which is a warm local cache or a pinned session. Both of those are
state, which puts you back in this material.

Redis Cluster gets the same property without a ring. The key space is a fixed 16,384 hash slots,
`HASH_SLOT = CRC16(key) mod 16384`, and each master owns a subset of them. The slot count never
changes, so the key-to-slot function never changes either; adding a node moves ownership of slots,
and the keys inside them, and nothing else.

## Worked example

Eight keys, four servers, and a fifth server arriving. The hash values are given. Every column after
them is arithmetic you can check.

```
ring positions: A at 100, B at 400, C at 700, D at 850. E arrives at 250.

  key    hash     % 4     % 5     ring pos      owner       owner
                (4 srv) (5 srv)  (hash % 1000)  (4 srv)     (5 srv)
  k1     1042      2       2          42          A           A
  k2     2177      1       2         177          B           E     moved
  k3     3355      3       0         355          B           B
  k4     4491      3       1         491          C           C
  k5     5628      0       3         628          C           C
  k6     6714      2       4         714          D           D
  k7     7809      1       4         809          D           D
  k8     8946      2       1         946          A           A

  modulo:  7 of the 8 keys land on a different server.
  ring:    1 does.
```

The ring column is the first position clockwise, wrapping, which is why k8 at 946 belongs to A at 100. E arriving at 250 takes ownership of the arc from 100 to 250, and k2 is the only key in it. B
loses that key and keeps k3; A, C and D are not involved at all. Under `% n` there is no arc and no
neighbour, only a remainder that changed for everybody.

The ring here has a thousand positions so the arithmetic fits on a line. A real one uses the hash
function's full output range, and each server sits at many of those positions rather than one.

## Traps

**Added a fifth cache node and the database fell over.** The routing was `hash(key) % n`, so the
node count is part of every key's address, and one more node reassigned nearly all of them in the
same instant. The cache was not cleared, it was orphaned. A ring changes only the arc the new node
occupies.

**Moved to a ring and one node still takes three times the traffic of another.** Each server has a
single position, so the arcs came out whatever length the hash made them, and share of the ring is
share of the load. Give every physical server many positions and its share becomes the sum of many
arcs.

**Removed a node cleanly and its neighbour fell over a few seconds later.** With one position per
server, the entire departing arc goes to the single successor, which doubles both its request rate
and its working set. Virtual nodes spread that arc across many neighbours instead, which is the half
of the feature that only shows up on the bad day.

**The same key is cached twice, with different values, on two different nodes.** Every client
computes the ring itself, from the hash function, the number of virtual positions per server, and
the exact string identifying each node. If one client is configured with a hostname and another with
an IP, or two client libraries count virtual positions differently, they are walking two different
rings and disagreeing about who owns the key. The ring is configuration, so it has to be identical
everywhere it is computed.
