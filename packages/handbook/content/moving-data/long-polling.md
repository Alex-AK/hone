---
title: Long polling
question: The client needs updates and I can only count on plain HTTP getting through. Is holding a request open still a real answer?
order: 8
practise:
  - http-timeout-fetch
  - http-sse-vs-websocket
  - sys-thundering-herd
  - code-retry
sources:
  - author: IETF
    title: 'RFC 6202: Known Issues and Best Practices for the Use of Long Polling and Streaming in Bidirectional HTTP'
    url: https://www.rfc-editor.org/rfc/rfc6202.html
  - author: IETF
    title: 'RFC 9110: HTTP Semantics'
    url: https://www.rfc-editor.org/rfc/rfc9110.html
  - author: MDN
    title: 'AbortSignal: timeout() static method'
    url: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
  - author: Amazon Web Services
    title: Amazon SQS short and long polling
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html
verified: 2026-08-01
---

The client asks for updates, and instead of answering straight away the server waits until it has
news or a timer runs out. The client then asks again at once. It needs nothing but plain HTTP, which
is why it still works where other options get blocked, but anything that happens between one answer
and the next request can be lost.

## The model

The client sends an ordinary GET and the server does not answer it. It holds the request open,
replying only when it has something to say or when a deadline it picked runs out. The client reads
the response and immediately asks again.

That is the whole technique: request/response, with the response delayed on purpose. RFC 6202
describes it as the server holding each request open and responding only when there are events to
deliver. Nothing new is on the wire.

**Who starts it.** The client, always, which is the entire reason this survives. There is no upgrade
handshake, no unusual content type, no connection that a proxy has to be taught about. It is a slow
request, and every piece of HTTP infrastructure ever built already knows what one of those is. When
something on the path strips `Connection: Upgrade`, or a client library predates `EventSource`, or a
gateway will only forward complete request/response pairs, this is what still works.

**How many messages.** One exchange, repeated forever. Every message costs a full set of request
headers, a response, and then a new request. For small, frequent messages that overhead is most of
the traffic.

**Delivery.** Nothing is held for you. Between the response going out and the next request arriving,
the client is not there, and anything published in that gap has nobody to go to. RFC 6202 puts the
average latency at close to one network transit and the worst case at over three, because an event
that fires just after a response has to wait for the next request before it can be sent.

**Cost.** One request in flight per client, permanently. The RFC is explicit that this holds both a
TCP connection and an HTTP request open for every client, and both have to be sized for. On an event
loop a held request is a socket and a closure. On a server that dedicates a thread or a worker to
each request, it is a worker doing nothing.

It is not only a browser fallback. `ReceiveMessage` in SQS is long polling: set a wait time above
zero and the call is held open until a message is available, up to a maximum of 20 seconds, which
AWS documents as the way to cut empty responses and cost. The pattern is worth recognising because
you will implement it on both sides of a system.

## Worked example

An endpoint that answers immediately when there is a backlog and otherwise waits, with a cursor so
that nothing falls into the gap:

```js
app.get('/updates', (req, res) => {
  const since = Number(req.query.since ?? 0);

  const backlog = eventsAfter(since);
  if (backlog.length > 0) return respond(backlog);

  // Nothing yet. Hold it, but answer before anything in the middle gives up.
  const timer = setTimeout(() => respond([]), 25_000);
  const unsubscribe = onEvent((event) => respond([event]));
  req.on('close', cleanup);

  function respond(events) {
    cleanup();
    res.json({ events, cursor: events.at(-1)?.id ?? since });
  }

  function cleanup() {
    clearTimeout(timer);
    unsubscribe();
  }
});
```

The client half is the part that gets skipped:

```js
let cursor = 0;

while (running) {
  try {
    const res = await fetch(`/updates?since=${cursor}`, {
      signal: AbortSignal.timeout(30_000), // longer than the server's own deadline
    });
    const { events, cursor: next } = await res.json();
    cursor = next;
    events.forEach(render);
  } catch {
    await sleep(1000 + Math.random() * 1000);
  }
}
```

The client's timeout has to exceed the server's hold, or it aborts every healthy poll and never sees
an event at all.

## Traps

**Updates go missing, and only under load.** The server answered, and the next request has not
arrived yet. Whatever was published in between had nobody to send it to. The transport will not tell
you either, because a poll that returns nothing looks identical to a poll that missed something. The
`since` cursor and a short server-side backlog are not a refinement, they are what makes this
correct.

**It works locally and returns 504 in production.** A proxy, load balancer or gateway on the path
gave up before your server answered. RFC 6202 flags exactly this: a hold time set too high earns a
408 from the server or a 504 from a proxy, and while experiments have succeeded at 120 seconds, it
names 30 seconds as the safer value. Hold for less than the shortest timeout on the path, answer
with an empty result, and let the client come straight back.

**Five thousand idle clients and the server is out of workers.** The confusing part is that nothing
is happening. Every one of those requests is doing nothing and occupying something while it does it.
This is survivable on an event loop and fatal on a fixed pool of synchronous workers, so the number
to watch is held requests, not requests per second.

**Everyone comes back in the same millisecond.** A deploy drops every held request at once and every
client re-polls immediately, so the server boots into its entire client base plus the backlog that
built up while it was down. The random delay in the client loop above is what stops that: without
jitter the herd stays synchronised and hits again on every subsequent failure.
