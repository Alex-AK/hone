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

## The model

Start with why the cache emptied, because the mechanism is the easy half.

`server = hash(key) % n` ties a key's home to the current value of n rather than to the key. Change
n by one and the remainder changes for nearly every key at once, so nearly every lookup goes to a
machine that has never held that key. Nothing expired and nothing was evicted. The old entries are
still sitting in memory on servers nobody is asking. The hit rate falls to roughly zero in the
moment the config changes, and the database absorbs the entire read load, from a deploy whose whole
purpose was to reduce load.

Consistent hashing takes n out of the calculation. Hash the servers as well as the keys, into the
same output space, and treat that space as a circle where the largest value wraps back to zero. A
key belongs to the first server clockwise from its own position. A key's position depends on the key
alone and never moves. A server's position depends on that server's identity and not on how many
other servers exist.

Everything else follows from that. Adding a server changes the owner of exactly one arc, the keys
lying between the new server's position and the next server counterclockwise from it, and every key
outside that arc keeps the owner it had. Removing a server hands its arc to its clockwise neighbour
and touches nothing else. Cassandra describes its own version in one sentence: it "maps every node
to one or more tokens on a continuous hash ring, and defines ownership by hashing a key onto the
ring and then 'walking' the ring in one direction".

The arithmetic, stated honestly. With `% n`, a key keeps its server only by coincidence, so close to
all K keys move. On a ring, adding or removing a server moves about K/n keys. That K/n is an average
over where the positions happened to fall, not a bound, and it is only as good as the spread of
those positions.

**Virtual nodes** are what make the spread good, which is why they are not an optimisation to leave
for later. With one position per server, the arcs come out at whatever lengths the hash gives them,
so a server's share of the ring is random rather than equal, and a single successor inherits the
whole of a departing server's traffic and working set. Give each physical server many positions
instead: its share becomes the sum of many small arcs, which evens out, and its departure is
absorbed by many neighbours rather than one. Cassandra's virtual nodes work by "assigning multiple
tokens in the token ring to each physical node", with the result that "when a new node is added it
accepts approximately equal amounts of data from other nodes in the ring". How many positions is a
real decision, and one is nowhere near enough: Cassandra's docs record that picking tokens at random
meant "the default number of tokens per node had to be quite high, at 256", and that the
deterministic allocator added in 3.x reaches the same balance "while requiring a much lower number
of tokens per physical node".

Where this belongs is anywhere a node holds state for a key: a cache tier, and the partitioning
layer of a hash-partitioned datastore. Amazon's Dynamo paper puts it plainly, saying its
"partitioning scheme relies on consistent hashing to distribute the load across multiple storage
hosts", and the Karger paper that named the technique was written about web caches in the first
place.

Where it does not belong is a load balancer choosing between stateless application servers. Nothing
is stored on those instances, so no request is cheaper for having landed on the same one, and round
robin or least-connections spreads work better. [Load balancers](./load-balancers.md) covers what
hashing at that layer actually buys, which is a warm local cache or a pinned session. Both of those
are state, which puts you back in this material.

Redis Cluster gets the same property by a different route, and is worth knowing precisely because it
is not a ring. The key space is a fixed 16,384 hash slots, `HASH_SLOT = CRC16(key) mod 16384`, and
each master owns a subset of them. The slot count never changes, so the key-to-slot function never
changes either; adding a node moves ownership of slots, and the keys inside them, and nothing else.

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
function's whole output range, and each server sits at many of those positions rather than one.

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
server, the whole departing arc goes to the single successor, which doubles both its request rate
and its working set. Virtual nodes spread that arc across many neighbours instead, which is the
half of the feature that only shows up on the bad day.

**The same key is cached twice, with different values, on two different nodes.** Every client
computes the ring itself, from the hash function, the number of virtual positions per server, and
the exact string identifying each node. If one client is configured with a hostname and another with
an IP, or two client libraries count virtual positions differently, they are walking two different
rings and disagreeing about who owns the key. The ring is configuration, so it has to be identical
everywhere it is computed.
