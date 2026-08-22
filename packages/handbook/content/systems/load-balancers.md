---
title: Load balancers
question: What changes about my application once there is a load balancer in front of it?
order: 4
practise:
  - sys-xfp-redirect-loop
  - sys-load-balancer-basics
  - sys-l4-vs-l7-balancer
  - sys-connection-level-balancing
  - security-xff-trust
sources:
  - author: Donne Martin
    title: System Design Primer
    url: https://github.com/donnemartin/system-design-primer
  - author: nginx
    title: Module ngx_http_upstream_module
    url: https://nginx.org/en/docs/http/ngx_http_upstream_module.html
  - author: nginx
    title: Module ngx_stream_core_module
    url: https://nginx.org/en/docs/stream/ngx_stream_core_module.html
  - author: Kubernetes
    title: Pod Lifecycle
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - author: MDN
    title: X-Forwarded-For
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For
  - author: MDN
    title: X-Forwarded-Proto
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-Proto
  - author: William Morgan
    title: gRPC Load Balancing on Kubernetes without Tears
    url: https://kubernetes.io/blog/2018/11/07/grpc-load-balancing-on-kubernetes-without-tears/
  - author: gRPC
    title: gRPC Load Balancing
    url: https://grpc.io/blog/grpc-load-balancing/
verified: 2026-08-22
---

## The model

A load balancer does two things: it picks which instance gets the next request, and it stops picking
an instance that fails its health check. Everything else it offers is built on those two.

How it picks:

- **Round robin** — each instance in turn. nginx's default, and enough when requests cost roughly
  the same.
- **Least connections** — whichever instance has the fewest requests in flight, so one instance
  stuck on something slow stops being handed more.
- **Hashing** — derive the choice from something in the request, a client address or a header, so
  the same input keeps landing on the same instance. That is how you get a warm local cache, and
  also how you get one hot instance.

How it finds out an instance is bad: by measuring, and only by measuring. Open-source nginx measures
passively, off real traffic, with `max_fails` failed attempts inside `fail_timeout` (one attempt in
ten seconds, by default) marking the server unavailable for that long; active probing is a
commercial feature there. Kubernetes probes actively instead, and splits the question in two: a
readiness probe decides whether a Pod is sent traffic at all, a liveness probe decides whether the
container gets restarted.

**L4 or L7.** An L4 balancer forwards TCP connections without reading what is inside them, which is
what nginx's `stream` module does. An L7 balancer parses the HTTP request, and that is what buys
routing on path or host, and rewriting headers on the way through. Wanting `/api` on a different
pool from `/` is wanting L7. It also decides how often a choice gets made at all: an L4 balancer
picks once, when the connection opens, because a connection is the only thing it can see, while an
L7 balancer reads each request and can pick again for every one.

Then the part that lands in your code. The socket now tells you the balancer's address, identically,
for every request in the world, so the client's address survives only in `X-Forwarded-For` or
`Forwarded`, where it is a claim rather than a fact. TLS may end at the balancer, which leaves your
handler genuinely serving plain HTTP. And anything held in one process, a session, an in-progress
upload, a local cache, stops being reachable the moment the next request can land elsewhere.

## Worked example

One request, and what each hop sees:

```
client 203.0.113.7  ──HTTPS──▶  lb 10.0.0.4  ──HTTP──▶  api-2 10.0.2.9:3000

what api-2 sees
  socket address     10.0.0.4       the balancer, for every client there is
  X-Forwarded-For    203.0.113.7    appended by the balancer
  X-Forwarded-Proto  https          the leg the handler cannot see
```

And the check that decides whether api-2 is in that picture at all:

```js
// Answers "is this process running". The answer stays yes right through the outage.
app.get('/healthz', (_req, res) => res.send('ok'));

// Answers "can this instance serve a request", which is the question being asked.
app.get('/ready', async (_req, res) => {
  try {
    await db.query('select 1');
    res.send('ok');
  } catch {
    res.status(503).send('database unreachable');
  }
});
```

## Traps

**Every line in the access log has the same client IP, and rate limiting stops meaning anything.**
That address is the balancer, because the socket only knows who connected to you. Read the forwarded
header, and read it as a claim: count in from the right past exactly the hops you operate.
[Proxies and identity](../headers/proxies-and-identity.md) has the counting rule and the
`trust proxy` mistake that looks like a fix.

**Every generated link and redirect comes out as `http://`.** TLS terminated at the balancer, so the
handler really is serving plain HTTP and `req.protocol` is telling the truth about its own leg. With
redirect-to-HTTPS middleware still in place, that is a loop the browser eventually gives up on. Read
`X-Forwarded-Proto` instead.

**Users get logged out at random, and it stops happening when you scale back to one instance.** The
session lives in one process's memory and the next request landed on the other instance, which never
saw it. Move session state to a store every instance can reach. Sticky sessions are the other
answer, and they cost you: the user is pinned, so a deploy or a crash takes their session with it,
and the traffic stops being evenly spread.

**An instance passes its health check and 500s every request it gets.** The check proved the process
was alive, which it was. The database connection was the thing that died. Have the check touch a
dependency the request path actually needs, and keep it cheap and narrow, or one slow database takes
every instance out of rotation in the same second.

**Four healthy pods behind round robin, and one of them is taking 90% of the traffic.** Round robin
picks a backend per connection, and a client speaking HTTP/2 or gRPC holds one connection open and
multiplexes every request over it, so the choice is made once at connect time and never revisited.
William Morgan's write-up on the Kubernetes blog is blunt about it: "Once the connection is
established, there's no more balancing to be done. All requests will get pinned to a single
destination pod." HTTP/1.1 hid this rather than fixing it, because it cannot multiplex: clients open
several connections and let them expire, and that churn is what makes connection-level balancing
pass for request-level. Move the decision to where the requests are visible, an L7 proxy or mesh
sidecar that routes each stream, a client that resolves every pod and balances itself, or a cap on
connection age so the choice gets made again.
