---
title: Logs, metrics and traces, and the label that costs the most
question: The alert fired, the dashboards are green, and nobody can say which requests were affected. Which of the three were you missing?
order: 4
practise:
  - sys-metric-cardinality
  - sys-metric-series-count
  - sys-request-id-join
  - sys-trace-stops-at-the-queue
sources:
  - author: OpenTelemetry
    title: 'Signals: Logs'
    url: https://opentelemetry.io/docs/concepts/signals/logs/
  - author: OpenTelemetry
    title: 'Signals: Metrics'
    url: https://opentelemetry.io/docs/concepts/signals/metrics/
  - author: OpenTelemetry
    title: 'Signals: Traces'
    url: https://opentelemetry.io/docs/concepts/signals/traces/
  - author: OpenTelemetry
    title: Context propagation
    url: https://opentelemetry.io/docs/concepts/context-propagation/
  - author: Prometheus
    title: Data model
    url: https://prometheus.io/docs/concepts/data_model/
  - author: Prometheus
    title: Instrumentation
    url: https://prometheus.io/docs/practices/instrumentation/
verified: 2026-08-09
---

When something goes wrong in production, you have only what the running app recorded about itself.
That record comes in three kinds: individual events written down one at a time, counts and timings
rolled up over time, and the path of a single request through everything it touched. Each answers a
different question. An incident where the graphs look fine and nobody can say which requests failed
usually means one kind was asked to do another's job.

## The model

**Logs, metrics and traces each answer a question the other two cannot.**

- **Logs** answer "what happened during this one request". OpenTelemetry defines a log as a
  timestamped text record, structured or not, and recommends structured: a consistent schema that
  downstream systems can parse reliably. You pay per event, and you can put anything on a line.
- **Metrics** answer "how has the system been behaving". A metric is a measurement of a service
  taken at runtime, and the important part is that it is aggregated before you ever query it. That
  is why it is cheap enough to keep for a year and why it can never tell you about one request.
- **Traces** answer "where did the time go, across everything that had to happen". A trace is the
  path of a request through your application, built from spans, each one a unit of work. You pay per
  span, so traces are usually sampled.

Metrics tell you something is wrong and roughly when; a trace tells you which hop; a log line tells
you what that hop actually did. An incident where the dashboards are green and nobody can name the
affected requests is usually a system with the first and none of the rest.

**What joins them is an id, and it does not appear by itself.** A request id generated at the edge,
carried on every log line, returned in the response, and passed to everything downstream is the
cheapest observability you can buy. OpenTelemetry does the trace half of this automatically once it
is in the picture, wrapping each log body with the ids of the active trace and span.

### Cardinality, which is the one piece of arithmetic here

Prometheus identifies every time series by its metric name and its labels, and says "The change of
any label's value, including adding or removing labels, will create a new time series". So the cost
of a metric is the product of the number of distinct values each of its labels can take, not the
number of requests it counts.

That product grows the way products do:

```
http_requests_total{route, method, status}

  route      40 values      the route templates in the app
  method      4 values
  status      6 values
                            ────────────────
                                 960 series

add user_id, 200,000 users:  192,000,000 series
```

Every one of those series costs RAM, CPU, disk and network of its own, Prometheus says, and its
guidance for a metric above a cardinality of about a hundred is to look for another way: fewer
dimensions, or moving the analysis out of monitoring into a general-purpose processing system.
OpenTelemetry names the same offenders, warning that attributes like user IDs or raw URL paths can
cause unbounded memory growth.

**So the rule that decides where a field goes: if its set of values is unbounded, it is a log field
or a span attribute, never a metric label.** User ids, order ids, email addresses, raw URL paths,
error messages, anything a user typed. Logs and traces are per-event stores built for exactly this.

## Worked example

One request, instrumented three times, with each field in the place that can afford it:

```js
app.get('/orders/:id', async (req, res) => {
  const start = performance.now();
  const span = tracer.startSpan('GET /orders/:id');
  span.setAttribute('user.id', req.user.id); // unbounded, and fine on a span
  span.setAttribute('order.id', req.params.id);

  const order = await orders.find(req.params.id);
  res.json(order);

  const ms = performance.now() - start;
  span.end();

  // Bounded values only. route is the template, never req.path.
  httpRequests.inc({ route: '/orders/:id', method: 'GET', status: 200 });
  httpDuration.observe({ route: '/orders/:id' }, ms);

  log.info(
    { requestId: req.id, userId: req.user.id, orderId: req.params.id, route: '/orders/:id', ms },
    'served order'
  );
});
```

`route` is the route template and not `req.path`, which is the difference between 40 series and one
per order that has ever been fetched. The user id appears twice, on the span and on the log line, and
in neither place does it multiply anything.

The request id has to start somewhere and survive every hop:

```js
app.use((req, res, next) => {
  req.id = req.get('x-request-id') ?? randomUUID(); // trust it only from your own proxy
  res.set('x-request-id', req.id);
  next();
});
```

Returning it in the response is what makes a support ticket useful: the id in the screenshot is the
id in the logs.

## Traps

**Adding one label emptied the dashboards and tripled the bill.** Somebody labelled a counter with
something unbounded, and every panel that grouped by the old labels started reading a different set
of series. In OpenTelemetry, past the cardinality limit, measurements collapse into a single point
marked `otel.metric.overflow=true`, and "overflow replaces the entire attribute combination, not
just its high-cardinality part", so the low-cardinality dimensions you actually wanted go over the
cliff with it. Review a new label by asking one question: could this value ever be an id, an
address, a raw path or a message?

**Five services logged the failure and nobody can tell whether it was one failure or five.** There
is nothing to join on. Generate an id at the edge, accept an inbound one only from a proxy you
operate, put it on every line, and forward it on every outbound call. Without it, correlating by
timestamp is guesswork, and worst at peak volume, which is exactly when it matters.

**The trace is complete up to the point the work was queued, and then stops.** Context does not
travel by itself. OpenTelemetry's propagation is what moves it between services and processes, and
over HTTP that is a header that instrumentation sets for you. A queue message carries nothing you
did not put in it, and neither does a row in an outbox table or a job in a database. Put the trace
context in the message body or its headers and start the consumer's span from it, or
[the second half of the write](../systems/two-systems-one-write.md) is permanently invisible.

**You logged the request object and the logs now hold an Authorization header.** Serialising a whole
object is how secrets reach a log store that has broader access than the app does. Redact by
allow-list, naming the fields you want, because a deny-list only knows the field names that existed
when it was written.

**The error-rate metric is fine and one customer is having a terrible morning.** Aggregation is why
a metric cannot answer this, and a per-customer label walks straight into the arithmetic above. That
question belongs to logs and traces, filtered by the id you already put there. Where the question is
about the shape of the distribution rather than about one customer, the answer is percentiles rather
than a new dimension, and [latency and throughput](../systems/latency-and-throughput.md) has why an
average will not do.
