---
title: WebSockets
question: When is a real two-way connection worth what it costs to run?
order: 10
practise:
  - http-websocket-auth-header
  - http-websocket-upgrade
  - http-sse-vs-websocket
  - security-token-storage
  - shared-card-websocket
sources:
  - author: IETF
    title: 'RFC 6455: The WebSocket Protocol'
    url: https://www.rfc-editor.org/rfc/rfc6455.html
  - author: WHATWG
    title: WebSockets Standard
    url: https://websockets.spec.whatwg.org/
  - author: MDN
    title: WebSockets API
    url: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
verified: 2026-08-01
---

A WebSocket turns an ordinary web request into a connection that stays open, where either side can
send a message at any moment. That freedom is what a chat or a shared editor needs. It also gives up
what plain HTTP did for you: the browser will not reconnect on its own, load balancers and caches
can no longer help, and once there is more than one server a message has to find the one process
holding the right connection.

## The model

A WebSocket begins as an HTTP request and then stops being HTTP.

The client sends a GET carrying `Upgrade: websocket`, `Connection: Upgrade` and a random
`Sec-WebSocket-Key`. A server that agrees answers `101 Switching Protocols` and echoes back a
`Sec-WebSocket-Accept` derived from that key and a fixed GUID written into RFC 6455. The hashing
step is not security; it is proof that something on the other end actually understood the
handshake, so a cache or an oblivious proxy cannot reply 101 by accident.

After the 101, the same TCP connection carries frames in both directions, and none of HTTP applies
to them. No methods, no status codes, no per-message headers, no caching, nothing for a load
balancer to route on. Either side sends whenever it likes.

Everything that gets harder is a consequence of that last sentence. HTTP's statelessness was what
let anything in the middle make decisions on its own. A socket is a relationship between one client
and one specific server process, and every piece of infrastructure that used to help now has to be
told what to do about it.

## Worked example

The socket itself is trivial. What surrounds it is the actual work:

```js
function connect(attempt = 0) {
  const socket = new WebSocket('wss://example.com/room/42');

  socket.addEventListener('open', () => {
    attempt = 0;
    socket.send(JSON.stringify({ type: 'resume', since: lastSeenId }));
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    lastSeenId = message.id;
    apply(message);
  });

  // No automatic reconnect: that part is yours. Back off, and add jitter so a
  // server restart doesn't bring every client back at the same instant.
  socket.addEventListener('close', () => {
    const delay = Math.min(1000 * 2 ** attempt, 30000);
    setTimeout(() => connect(attempt + 1), delay + Math.random() * 1000);
  });
}
```

The `resume` message is the interesting line. SSE gets this from the specification via
`Last-Event-ID`; over a socket, "what did I miss" is an application-level protocol you design, which
means the server has to be able to answer it, which means messages have to be retained and numbered.
That is the real cost of the upgrade, and it arrives long before scaling does.

## Traps

**It works on your machine and dies in production after sixty seconds.** Something in the middle
closes idle connections: a load balancer, a corporate proxy, a mobile network. The protocol has ping
and pong frames for exactly this, but the browser API does not expose them, so the browser answers
pings and cannot send them. In practice you send an application-level heartbeat and treat a missing
reply as a dead connection, because a socket can be closed in a way that never fires `close`.

**A second server instance breaks it silently.** Each socket lives on exactly one process. A message
that needs to reach a client connected elsewhere has nowhere to go, so half your users stop seeing
updates and nothing errors. The fixes are a shared bus that every instance subscribes to, or sticky
routing, and both are infrastructure you now own. This is the day the WebSocket decision gets
re-examined, and it is much cheaper to make it on day one.

**Auth by URL, because the API left you no choice.** The browser's `WebSocket` constructor cannot
set request headers, so there is no `Authorization` header to use. The common workarounds are a
cookie sent with the handshake, a short-lived ticket in the query string, or a token passed as a
subprotocol. A long-lived token in the URL ends up in logs and referrers; if you go that way, make
it single-use and short.

**Sending faster than the network drains.** `send()` never blocks, so a client that pushes updates
faster than the connection can carry them grows a buffer instead of slowing down. `bufferedAmount`
tells you how many bytes are queued and not yet on the wire; a producer that ignores it will happily
use unbounded memory. The spec also notes it does not reset to zero when the connection closes,
which makes it a poor liveness check and a fine backpressure signal.
