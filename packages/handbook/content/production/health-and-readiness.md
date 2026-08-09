---
title: Health, readiness, and the deploy that dropped requests
question: The deploy reported success and a few hundred requests failed while it ran. Which check was answering the wrong question?
order: 3
practise:
  - sys-liveness-vs-readiness
  - sys-drain-before-close
  - sys-readiness-too-early
  - sys-load-balancer-basics
sources:
  - author: Kubernetes
    title: 'Liveness, Readiness, and Startup Probes'
    url: https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/
  - author: Kubernetes
    title: Explore Termination Behavior for Pods And Their Endpoints
    url: https://kubernetes.io/docs/tutorials/services/pods-and-endpoint-termination-flow/
  - author: nginx
    title: Module ngx_http_upstream_module
    url: https://nginx.org/en/docs/http/ngx_http_upstream_module.html
  - author: Node.js
    title: 'HTTP: server.close'
    url: https://nodejs.org/api/http.html#serverclosecallback
verified: 2026-08-09
---

## The model

Three words that sound like the same question, and a platform that keeps them apart because the
consequence of each one failing is different. Kubernetes states each in a sentence:

- "Liveness probes determine when to restart a container."
- "Readiness probes determine when a container is ready to accept traffic."
- "Startup probes verify whether the application within a container is started."

The consequences are the whole distinction. Liveness failing kills the container: "If a container
fails its liveness probe more times than the configured tolerance, the kubelet restarts that
container." Readiness failing does not kill anything, it stops the traffic: "If the readiness probe
returns a failed state, the EndpointSlice controller removes the Pod's IP address from the
EndpointSlices of all Services that match the Pod." One is a kill switch and one is a traffic switch,
and pointing the kill switch at a shared dependency is how a database blip becomes a fleet-wide
restart.

**Readiness is the only one you drive on purpose**, which is what makes it the mechanism the deploy's
swap actually runs on. At the start of an instance's life, failing readiness is how it says "still
loading, not me". At the end, failing readiness is how it says "stop sending, I am about to go". Both
ends of [the swap](./what-a-deploy-is.md) are the same switch, thrown in opposite directions.

**Nothing finds out instantly, and that gap is where requests die.** Whatever is in front of you
learns by asking, on an interval. nginx's passive version defaults to one unsuccessful attempt inside
a `fail_timeout` "set to 10 seconds"; an active probe has a period and a failure threshold. So
between the moment your process decides to stop and the moment traffic stops arriving, there are
seconds, and requests keep coming through all of them.

That is why the shutdown order is not the obvious one:

```
stop signal arrives
   |
   1  fail readiness            still serving, still in the pool
   2  wait                      longer than the checker's interval; traffic tails off
   3  stop accepting            server.close(): no new connections
   4  finish what is in flight  the requests already inside your process
   5  exit
```

Closing the server first inverts steps 1 and 3, and the balancer spends the next several seconds
sending requests into a socket that is refusing connections. Kubernetes describes the same overlap
from the other side: an endpoint that is terminating is marked `ready: false` while `serving` stays
`true`, and during that period, in the tutorial's words, "all this time nginx will keep processing
requests."

## Worked example

Two endpoints that answer two questions, and one flag connecting the second to shutdown:

```js
let ready = true;

// Liveness: is this process wedged? Responding at all is most of the answer.
app.get('/healthz', (_req, res) => res.send('ok'));

// Readiness: should this instance be sent a request right now?
app.get('/ready', async (_req, res) => {
  if (!ready) return res.status(503).send('draining');
  try {
    await db.query('select 1');
    res.send('ok');
  } catch {
    res.status(503).send('database unreachable');
  }
});
```

And the shutdown path, in the order above:

```js
process.on('SIGTERM', () => {
  ready = false; // 1. leave the pool, keep serving

  setTimeout(() => {
    // 2. longer than the readiness interval
    server.close(() => process.exit(0)); // 3 and 4
  }, config.drainMs);

  // 5. a deadline, so one stuck handler cannot hold the deploy open
  setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, config.drainMs + config.shutdownMs).unref();
});
```

`server.close()` is gentler than its name suggests, and gentler than you might want. Node's
documentation for it: it "stops the server from accepting new connections and closes all connections
connected to this server which are not sending a request or waiting for a response", and since v19
that includes idle keep-alive connections. What it does not do is interrupt a request already being
served, so its callback runs when the last handler finishes, which is why the second timer exists.
`server.closeAllConnections()` is the forceful one, documented as closing connections "including
active connections connected to this server which are sending a request or waiting for a response",
so it belongs after a deadline rather than instead of the wait.

## Traps

**One database blip restarted every instance in the fleet.** The liveness probe touched the database,
and liveness failing means kill. A dependency outage became a restart loop, which then meant nothing
could serve the requests that did not need the database either, and cold processes hit the database
harder the moment it recovered. Liveness answers "is this process wedged", and for a Node server the
honest cheap answer is that the event loop was free enough to respond. Dependencies belong in
readiness, where failing means "not me" instead of "kill me".

**Every instance failed readiness in the same second and the balancer had nowhere left to send.** The
readiness check queried a dependency all of them share, so they left the pool together, every
endpoint was removed, and requests that could have been served from cache got a 503 from the balancer
instead. Readiness is per instance, so check what this instance uniquely needs: its own pool, its own
disk, its own warm-up. Where the dependency is shared, degrade inside the handler rather than leaving
the rotation, because a 200 with a stale answer beats a 503 from a pool with nothing in it.

**Readiness returned 200 before the process was ready.** An endpoint registered by the framework
before the connection pool, the cache warm-up or the migration check has finished answers "yes" the
instant it can answer anything, so the swap hands it traffic and the first few hundred requests are
the ones that pay. Start the flag at `false` and set it after boot completes, or give the platform a
startup probe, which exists for this: while one is configured, "Kubernetes does not execute liveness
or readiness probes until the startup probe succeeds".

**The health check is the only thing hitting the endpoint, and it looks like traffic.** Probes are
requests. At one per instance per interval across a fleet, they are a visible fraction of your
request count, they land in the access log, and they are cheap only if the check itself is. A
readiness check that runs a real query on every probe turns a fleet-wide probe interval into a
standing load on the database you were trying to protect.
