---
title: Scaling up and scaling out
question: The box is at its limit. Bigger box, or more boxes?
order: 2
practise:
  - sys-scalability-horizontal-vertical
sources:
  - author: Donne Martin
    title: System Design Primer
    url: https://github.com/donnemartin/system-design-primer
  - author: Adam Wiggins
    title: 'The Twelve-Factor App: VI. Processes'
    url: https://12factor.net/processes
  - author: Microsoft
    title: Design to scale out
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/design-principles/scale-out
  - author: Kubernetes
    title: Horizontal Pod Autoscaling
    url: https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/
  - author: nginx
    title: Module ngx_http_upstream_module
    url: https://nginx.org/en/docs/http/ngx_http_upstream_module.html
verified: 2026-08-01
---

A bigger machine needs no changes to your code, and that is its appeal, but it has a ceiling and it
is still one machine that can go down. Running more copies behind a load balancer has no ceiling. It
works only once nothing important lives inside a single copy, like sessions held in memory or files
saved to its own disk.

## The model

Vertical scaling is a bigger box: more cores, more RAM, the same single machine. Nothing about the
program changes, which is the whole appeal. One process, one memory space, one lock, one log file,
and a `Map` at module scope that every request can still see.

It has two problems, and only one of them is the ceiling. The catalogue runs out eventually, and the
top of it is priced accordingly: the System Design Primer's argument for scaling out is that
commodity machines are "more cost efficient" and give "higher availability" than one expensive
server. The second problem is that the box is the entire service. A kernel upgrade, a bad disk or a
reboot is an outage, because there is nothing else serving.

Horizontal scaling is more boxes behind a [load balancer](./load-balancers.md). Kubernetes draws the
line in one sentence: horizontal scaling means "deploy more Pods", where vertical scaling would mean
"assigning more resources to the Pods that are already running". There is no hardware ceiling, and
the redundancy is a by-product rather than a second project, since the thing that lets a fourth
instance absorb peak traffic is the thing that lets it absorb the loss of the third.

**Horizontal scaling is a statement about state.** That is the part worth memorising. If a response
depends only on the request and on backing services every instance can reach, the instance count is
a dial you turn. The moment it depends on _which process_ handled the request, another instance
changes behaviour rather than capacity: two requests from the same user land on two machines, and
the second one cannot see what the first one wrote. Twelve-factor states the target directly, that
processes are "stateless and share-nothing" and anything that must persist belongs in "a stateful
backing service".

So the real work of scaling out is an inventory: find everything living in one process, and move it
somewhere shared before the second instance exists. Sessions to Redis or into a signed cookie,
uploads to object storage, counters to a shared store, scheduled jobs behind a lock. After that,
capacity genuinely is arithmetic.

**Sticky sessions are the compromise**, and worth naming as one. Route a client back to the instance
it used before, by hashing its address, and in-process state keeps working while you run several
machines. nginx's `ip_hash` does it on "the first three octets of the client IPv4 address, or the
entire IPv6 address". What it costs is real: the pinned user's state dies with that instance on the
next deploy or crash, traffic is only as evenly spread as the hash, and Microsoft's scale-out
guidance is blunt that "stickiness limits the application's ability to scale out". Use it to buy
time, not to close the ticket.

One last limit. Scaling out multiplies whatever can be cloned, and nothing else. "Scaling out isn't
a magic fix for every performance issue," as the same guidance puts it, "if your backend database is
the bottleneck, it won't help to add more web servers." A database is the standing example, because
extra copies of it are a different technique with consequences of their own:
[replication](./replication.md).

## Worked example

The inventory, for an ordinary Node service going from one instance to three.

```
lives in the process now          at 3 instances

sessions in a Map                 breaks   → shared store, or a signed cookie
rate-limit counters               breaks   → shared counter, or accept 3x the limit
uploads written to ./uploads      breaks   → object storage
setInterval nightly job           breaks   → runs 3x; needs a lock, a leader or a queue
db connection pool, size 20       watch    → 3 x 20 = 60 connections at one database
config read once at boot          fine     → derived from a source of truth, not the truth
```

The first four are why a service that works on one box misbehaves on three. The fifth is why scaling
out stops helping: the pool multiplies with the instance count, so the database's own connection
limit becomes the ceiling you actually hit.

## Traps

**Instance count doubled and throughput barely moved.** The web tier was not the bottleneck. Every
instance still queues behind the same database, the same lock or the same third-party API, so you
bought more of the thing that was already waiting. Find where the time goes before adding capacity
on either axis.

**The nightly email went out three times, to everyone.** The job is a `setInterval` inside the
application process, so it was never one job. It was one job per replica. Scheduled work either
needs a lock that only one instance can hold, or it belongs in a queue with a single consumer.

**An uploaded avatar loads on some page views and 404s on others.** The file is on the local disk of
the one instance that handled the upload, and the load balancer sends the next request wherever it
likes. Local disk is per-instance scratch space once there is more than one instance.

**Sticky sessions are on, one instance sits at 90% CPU while two idle, and every deploy logs people
out.** Both symptoms are the same compromise. The hash key is coarse enough that a whole office
behind one NAT lands on a single instance, and the pin only lasts as long as the process holding
that user's memory. It works, in the sense that it postpones moving the state.
