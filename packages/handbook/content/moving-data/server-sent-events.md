---
title: Server-Sent Events
question: How do I push updates to the browser without holding a WebSocket open?
order: 9
practise:
  - http-sse-content-type
  - http-sse-resume
  - http-sse-vs-websocket
  - http-streaming-response
  - live-dashboard-sse
sources:
  - author: WHATWG
    title: 'HTML Standard: Server-sent events'
    url: https://html.spec.whatwg.org/multipage/server-sent-events.html
  - author: MDN
    title: Using server-sent events
    url: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
  - author: MDN
    title: EventSource
    url: https://developer.mozilla.org/en-US/docs/Web/API/EventSource
verified: 2026-08-01
---

Sometimes the browser only needs to listen, as a live dashboard does. Server-sent events handle that
by keeping one ordinary response open and letting the server write each update into it as it
happens. If the connection drops, the browser reconnects by itself and tells the server the last
update it saw, so the server can fill in what was missed.

## The model

An event stream is one HTTP response that never finishes. The client makes an ordinary GET, the
server answers `200` with `Content-Type: text/event-stream`, and then just keeps writing to the
body. Every hop in between treats it as a response still in progress, because that is exactly what
it is.

The format is deliberately dull. Lines of `field: value`, and a blank line dispatches whatever has
been accumulated as one event:

```
data: {"cpu":38}

event: alert
data: disk nearly full

: this line is a comment, and makes a fine keep-alive

id: 41
data: {"cpu":52}
```

Four fields exist. `data` is the payload. `event` names it, so the client can listen for
`alert` rather than `message`. `id` sets the last event ID, which the browser remembers. `retry`
sets how long the browser waits before reconnecting, in milliseconds. A line starting with a colon
is a comment, which is how you keep an idle connection from being closed by something in the middle.

The part that earns SSE its place is what the browser does when the connection drops, which it will.
`EventSource` reconnects on its own, and if it has seen an `id`, it sends that value back in a
`Last-Event-ID` request header. The spec requires both behaviours, so reconnection and resumption
are the transport's job rather than yours. The stream must be UTF-8; the specification says so, and
that is why binary payloads have to be encoded into text before they can travel this way.

## Worked example

The server writes events and gives each one an id, so a reconnecting client can say where it got to:

```js
app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });

  // The browser sends back the last id it saw. Replay the gap.
  const since = Number(req.headers['last-event-id'] ?? 0);
  for (const event of eventsAfter(since)) send(event);

  const timer = setInterval(() => send(nextReading()), 1000);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);

  req.on('close', () => {
    clearInterval(timer);
    clearInterval(keepAlive);
  });

  function send(event) {
    res.write(`id: ${event.id}\ndata: ${JSON.stringify(event.payload)}\n\n`);
  }
});
```

The client is three lines, and there is no reconnection logic in it because there does not need to
be:

```js
const stream = new EventSource('/events');
stream.addEventListener('message', (event) => render(JSON.parse(event.data)));
stream.addEventListener('error', () => showReconnecting()); // then it retries by itself
```

## Traps

**Nothing arrives, and nothing errors.** Two usual causes. The response did not declare
`text/event-stream`, so `EventSource` refuses it. Or something between you and the browser is
buffering: a reverse proxy that wants to compress the response, or a framework that holds output
until the handler returns. The stream is only live if every hop agrees to pass bytes through as they
come, so `Cache-Control: no-store` and turning off buffering on the proxy are part of the feature,
not deployment trivia.

**Reconnection without resumption, which reads as a data loss bug.** The connection drops, the
browser reconnects flawlessly, and the events from the eight seconds in between are simply gone. The
browser did its half; the server ignored `Last-Event-ID`. If nothing is emitting `id`, there is
nothing to resume from either. For a live gauge that is fine. For anything you are counting, it is a
wrong number that nobody will notice.

**The seventh tab stops working.** Over HTTP/1.1 a browser holds around six connections per domain,
and that budget is per browser rather than per tab, so a handful of open dashboards can exhaust it
and the next request just waits. MDN documents the number as six, and both Chrome and Firefox have
marked it won't-fix. Over HTTP/2 the streams are multiplexed and the limit becomes the negotiated
maximum concurrent streams, which defaults to a hundred, so this trap mostly disappears the day you
serve over HTTP/2.

**Authentication is awkward on purpose.** `EventSource` cannot set request headers, so there is no
place to put `Authorization: Bearer …`. The options are a cookie (`withCredentials: true`, plus the
CORS setup that goes with credentials) or a short-lived token in the query string, which then lands
in access logs. Neither is elegant. Decide which one you can live with before the endpoint exists.
