---
title: Service discovery
question: Thirty instances come and go. How does anything find them?
order: 5
practise:
  - sys-service-discovery
sources:
  - author: Donne Martin
    title: System Design Primer
    url: https://github.com/donnemartin/system-design-primer
  - author: Kubernetes
    title: Service
    url: https://kubernetes.io/docs/concepts/services-networking/service/
  - author: Kubernetes
    title: DNS for Services and Pods
    url: https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/
  - author: HashiCorp
    title: Consul documentation
    url: https://developer.hashicorp.com/consul/docs
  - author: IETF
    title: 'RFC 1035: Domain Names, Implementation and Specification'
    url: https://www.rfc-editor.org/rfc/rfc1035.html
verified: 2026-08-01
---

Autoscaling, deploys and crashes keep changing which servers are running, so an address written into
a config file goes stale almost at once. Service discovery is how one service finds a working copy
of another at the moment it needs to call it. It shrinks the window in which callers are sent to a
server that has already gone, but it never closes it.

## The model

An instance's address used to be a fact you could write in a config file. Autoscaling, rolling
deploys and rescheduling end that: the set of healthy addresses is different from one minute to the
next, so any list you write down is stale before it ships. Discovery turns "where is this service"
from a deploy-time fact into a runtime question. There are three ways to answer it.

- **DNS with a short TTL** — a name resolves to whatever is currently in rotation. Cheapest to
  adopt, because every client already speaks DNS. Weakest guarantee, because you control when the
  record changes and not when anyone stops using the old answer.
- **A registry** — instances register on startup and keep proving they are alive with a heartbeat or
  a health check, and a missed check drops the entry. Consul and etcd are the ones you will meet.
  Callers query the registry for a current, healthy address.
- **The platform** — a Kubernetes Service is a stable virtual IP and DNS name in front of whichever
  Pods are currently ready, with the routing done below you. You get discovery without writing any.

The other axis is who does the looking up. In client-side discovery the caller queries the registry
itself, receives the list, and picks an instance, which means it also owns the load balancing and
you build that once per language in the fleet. In server-side discovery the caller sends to one
stable address and something else, a load balancer or a mesh sidecar, resolves it and routes.
Kubernetes is the server-side shape: the client resolves one name and never learns a Pod's address.

## Worked example

One instance's whole life in a registry, checked every ten seconds:

```
09:00:00  api-7 starts, registers 10.0.2.7:3000, check interval 10s
09:00:10  check passes                  healthy: api-5, api-6, api-7
09:04:12  api-7 is SIGKILLed            nothing gets to deregister it
09:04:20  check fails                   api-7 marked unhealthy
09:04:20  lookups stop returning it     healthy: api-5, api-6
```

The eight seconds between 09:04:12 and 09:04:20 are the part worth keeping. The registry is
confidently wrong for the whole of that window and callers are being handed a dead address.
Discovery does not remove that window, it bounds it, which is why the caller still needs a timeout
and a retry onto a different instance.

The platform version of the same lookup, resolved from inside the cluster:

```
billing.payments.svc.cluster.local  →  10.96.14.3   the Service's cluster IP, never a Pod's
```

A normal Service gets an A record for its own address, and the choice of Pod happens after that,
underneath the client.

## Traps

**Traffic keeps arriving at an instance you terminated ten minutes ago.** Something cached the DNS
answer past its TTL, or resolved once at startup and never asked again. Connection pools are the
usual culprit, because no TTL expires a socket that is already open. Shortening the TTL fixes
nothing when nothing is looking the name up a second time: make clients re-resolve, and drain an
instance before killing it.

**The registry lists more instances than are running.** Deregistering on shutdown is best effort,
and a `SIGKILL`, a kernel panic or a partitioned network never gets to do it. This is why an entry
carries a health check rather than just a lifetime. Removal has to come from failing to be alive,
not from remembering to say goodbye.

**Every service is healthy and nothing can reach anything.** The registry went down and took the
whole system with it, because a lookup is now on the path of every call. Run it as a quorum cluster
rather than one node, and let clients hold their last good answer: a stale address that mostly works
beats no address at all.
