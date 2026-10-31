---
title: Latency and throughput
question: Requests are fast and the system still cannot keep up. How?
order: 3
practise:
  - sys-latency-vs-throughput
sources:
  - author: Donne Martin
    title: System Design Primer
    url: https://github.com/donnemartin/system-design-primer
  - author: Apache Kafka
    title: KafkaProducer
    url: https://kafka.apache.org/40/javadoc/org/apache/kafka/clients/producer/KafkaProducer.html
  - author: Google SRE
    title: Monitoring Distributed Systems
    url: https://sre.google/sre-book/monitoring-distributed-systems/
  - author: Prometheus
    title: Histograms and summaries
    url: https://prometheus.io/docs/practices/histograms/
  - author: web.dev
    title: Defining the Core Web Vitals metrics thresholds
    url: https://web.dev/articles/defining-core-web-vitals-thresholds
  - author: Wolfram MathWorld
    title: Little's Law
    url: https://mathworld.wolfram.com/LittlesLaw.html
verified: 2026-08-01
---

How long one request takes and how many requests a system can handle each second are separate
measurements. Making requests faster raises the second only if the time you saved was being spent at
whatever is actually in short supply, such as database connections. Averages also hide the slow
requests that users complain about, which is why the useful numbers describe the slowest share.

## The model

Fast is a fact about one request. Keeping up is a fact about the system. They are separate
measurements, and the System Design Primer states the pair: "Latency is the time to perform some
action or to produce some result. Throughput is the number of such actions or results per unit of
time." Nothing makes them move together, which is why a service can answer every request in 20ms and
still fall over at exactly the requests per second it always did.

**Batching is where you trade one for the other on purpose.** Hold operations back, send several as
one, and each operation now carries the waiting while the per-operation overhead gets divided among
them. Kafka's producer exposes the trade as a single number: `linger.ms` tells it to hold a batch
open "in hope that more records will arrive to fill up the same batch", which the docs describe as
buying "fewer, more efficient requests when not under maximal load at the cost of a small amount of
latency". Learn the direction and it transfers. More batching raises throughput and raises latency;
less batching does the reverse.

Then the two things that actually get people.

**An average hides the tail, so quote percentiles.** The SRE book's example is the whole argument in
one sentence: "If you run a web service with an average latency of 100 ms at 1,000 requests per
second, 1% of requests might easily take 5 seconds." A percentile keeps the shape the mean threw
away. p50 is the typical request, p95 and p99 are the slow ones, and p99 means one request in a
hundred is worse than this. That request is not randomly assigned. The slowest responses are the
ones with the most rows to sort and the most items to price, so the same accounts meet the tail
every day. Volume does the rest: even if the slow ones fell at random, a page making 100 requests
clears the p99 on all of them only 0.99^100 of the time, about 37%. Core Web Vitals thresholds pick
the 75th percentile for a related reason, to "ensure that a majority of visits to a page or site
experienced the target level of performance" without letting outliers set the number.

**You cannot average percentiles.** Ten servers each report a p95 and the dashboard shows the mean
of the ten. That figure is not the p95 of anything. Prometheus says it plainly: aggregating
precomputed quantiles "rarely makes sense", `avg(http_request_duration_seconds{quantile="0.95"})` is
labelled `// BAD!`, and the result is "statistically nonsensical values". Export buckets and compute
the quantile after summing across the fleet, never before.

**Concurrency is what ties the two measures together.** That relationship is Little's law: "under
steady state conditions, the average number of items in a queuing system equals the average rate at
which the items arrive multiplied by the average time that an item spends in the system", or
`L = λW`, from John D. C. Little. Rearranged for a service, throughput is concurrency divided by
latency. The catch is where you apply it. It binds at the constraint, so `L` is how many can be in
flight at the bottleneck (connections in the pool, workers, one lock) and `W` is the time each
spends there, not the whole request. Concurrency here means work in flight, not threads:
[one thread, many connections](../server-runtime/one-thread-many-connections.md) is how a single
Node process holds thousands of them.

## Worked example

A checkout endpoint takes 200ms and falls over at 500 req/s. Cache the pricing API and it takes
20ms. It still falls over at 500 req/s.

```
per request, before             per request, after
  180 ms  pricing API             0 ms  pricing API (cache hit)
   20 ms  holding a db conn      20 ms  holding a db conn
  ------                        ------
  200 ms  latency                20 ms  latency          10x better

the constraint: a pool of 10 database connections
  throughput = L / W, both measured at the constraint
  before     = 10 conns / 0.020 s = 500 req/s
  after      = 10 conns / 0.020 s = 500 req/s     unchanged
```

The 180ms you deleted was never spent at the constraint. Each request still holds a connection for
the same 20ms, so the ceiling does not move and the saved time is spent waiting for a free
connection instead. Two levers raise it: more connections, which raises `L`, or a faster query,
which cuts `W` where it counts. Adding instances behind a
[load balancer](./load-balancers.md) is the same lever applied to the whole service.

What the two measurements look like on one dashboard, for the same hour:

```
1,000,000 requests
  mean      120 ms      the number on the status page
  p50        90 ms      the mean sits above it, which is the tell
  p95       400 ms
  p99     2,400 ms      10,000 requests were slower than this
```

## Traps

**Caching made every request ten times faster and the service falls over at the same rate.** The
time you removed was not being spent at the bottleneck, so throughput never depended on it. Find
what is actually scarce, measure how long each request holds it, and change one of those two.

**The dashboard says 120ms and support says the app is unusable.** The mean is being quoted, and it
is being pulled up by a tail it also conceals. Publish p50 and p99 side by side; the gap between
them is the number that predicts complaints.

**The fleet p95 looks healthy and one server is on fire.** Percentiles were averaged across
instances, which produces a figure that describes no request anywhere. Aggregate the histogram
buckets, then take the quantile from the sum.

**More workers raised nothing and made every response slower.** The constraint was already
saturated, so the extra concurrency became queue rather than capacity. Little's law says so
directly: with throughput pinned, raising `L` can only raise `W`. Cap concurrency at what the
constraint can serve and shed the rest, which is the same reasoning behind
[circuit breakers](./circuit-breakers.md).
