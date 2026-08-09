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

## The model

Three signals, three questions, and the recurring mistake is asking one of them to do another's job.

- **Logs** answer "what happened during this one request". OpenTelemetry defines one as "a
  timestamped text record, either structured (recommended) or unstructured, with optional metadata",
  and structured means "a defined, consistent schema or typed fields that downstream systems can
  reliably parse and interpret". You pay per event, and you can put anything on a line.
- **Metrics** answer "how has the system been behaving". A metric is "a measurement of a service
  captured at runtime", and the important word is that it is aggregated before you ever query it.
  That is why it is cheap enough to keep for a year and why it can never tell you about one request.
- **Traces** answer "where did the time go, across everything that had to happen". A trace is "the
  path of a request through your application", built from spans, where "a span represents a unit of
  work or operation". You pay per span, so traces are usually sampled.

Each answers a question the others cannot. Metrics tell you something is wrong and roughly when; a
trace tells you which hop; a log line tells you what that hop actually did. An incident where the
dashboards are green and nobody can name the affected requests is usually a system with the first and
none of the rest.

**What joins them is an id, and it does not appear by itself.** A request id generated at the edge,
carried on every log line, returned in the response, and passed to everything downstream is the
cheapest observability you can buy. OpenTelemetry does the trace half of this automatically once it
is in the picture: it "will automatically correlate your existing logs with any active trace and
span, wrapping the log body with their IDs".

### Cardinality, which is the one piece of arithmetic here

Prometheus defines the unit you are paying for: "Every time series is uniquely identified by its
metric name and optional key-value pairs called labels", and "The change of any label's value,
including adding or removing labels, will create a new time series". So the cost of a metric is the
product of the number of distinct values each of its labels can take, not the number of requests it
counts.

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

The second line is not a bigger bill for the same thing. Prometheus is explicit that each one costs
resources of its own, "an additional time series that has RAM, CPU, disk, and network costs", and its
guidance for metrics above a cardinality of about a hundred is to stop: "investigate alternate
solutions such as reducing the number of dimensions or moving the analysis away from monitoring and
to a general-purpose processing system." OpenTelemetry names the same offenders directly:
"High-cardinality attributes, such as user IDs or raw URL paths, can cause unbounded memory growth."

**So the rule that decides where a field goes: if its set of values is unbounded, it is a log field
or a span attribute, never a metric label.** User ids, order ids, email addresses, raw URL paths,
error messages, anything a user typed. Logs and traces are per-event stores and are built for exactly
this; a metric is not a store you can put things in.

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
of series. OpenTelemetry's overflow behaviour is worth knowing before you meet it: past the
cardinality limit, measurements collapse into a single point marked `otel.metric.overflow=true`, and
"overflow replaces the entire attribute combination, not just its high-cardinality part", so the
low-cardinality dimensions you actually wanted go over the cliff with it. Review a new label by
asking one question: could this value ever be an id, an address, a raw path or a message?

**Five services logged the failure and nobody can tell whether it was one failure or five.** There is
nothing to join on. Generate an id at the edge, accept an inbound one only from a proxy you operate,
put it on every line, and forward it on every outbound call. Without it, correlating by timestamp is
guesswork, and it is worst exactly when it matters, because that is when the volume is highest.

**The trace is complete up to the point the work was queued, and then stops.** Context does not
travel by itself: propagation is "the mechanism that moves context between services and processes",
and over HTTP the mechanism is a header that instrumentation sets for you. A queue message carries
nothing you did not put in it, and neither does a row in an outbox table or a job in a database. Put
the trace context in the message body or its headers and start the consumer's span from it, or
[the second half of the write](../systems/two-systems-one-write.md) is permanently invisible.

**You logged the request object and the logs now hold an Authorization header.** Serialising a whole
object is how secrets reach a log store that has broader access than the app does. Redact by
allow-list, naming the fields you want, because a deny-list only knows the field names that existed
when it was written.

**The error-rate metric is fine and one customer is having a terrible morning.** Aggregation is what
a metric is for and the reason it cannot answer this, so reaching for a per-customer label to fix it
walks straight into the arithmetic above. That question belongs to logs and traces, filtered by the
id you already put there. Where the question is about the shape of the distribution rather than about
one customer, the answer is percentiles rather than a new dimension, and
[latency and throughput](../systems/latency-and-throughput.md) has why an average will not do.
