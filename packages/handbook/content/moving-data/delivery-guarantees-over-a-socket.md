---
title: Delivery guarantees over a socket
question: The connection dropped and came back. Which of my messages actually made it?
order: 6
practise:
  - http-sse-resume
  - sys-message-delivery-semantics
  - sys-ack-after-work
  - sys-idempotency
  - live-dashboard-sse
  - shared-card-websocket
sources:
  - author: IETF
    title: 'RFC 6455: The WebSocket Protocol'
    url: https://www.rfc-editor.org/rfc/rfc6455.html
  - author: WHATWG
    title: WebSockets Standard
    url: https://websockets.spec.whatwg.org/
  - author: WHATWG
    title: 'HTML Standard: Server-sent events'
    url: https://html.spec.whatwg.org/multipage/server-sent-events.html
  - author: MDN
    title: WebSocket.send()
    url: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send
verified: 2026-08-02
---

## The model

A socket delivers bytes in order for as long as it is up, and promises nothing about what happened
to them once it is down. Those are two different guarantees, and only the first one is in the
protocol.

Start with what `send()` means. It means queued, not delivered, and not processed. MDN is exact
about the states: "The browser will throw an exception if you call `send()` when the connection is
in the `CONNECTING` state. If you call `send()` when the connection is in the `CLOSING` or `CLOSED`
states, the browser will silently discard the data." So a call that returned without throwing is not
evidence of anything. It might be sitting in `bufferedAmount`, it might be on the wire, it might have
been dropped on the floor.

Even a polite shutdown does not close the gap. RFC 6455 makes the closing handshake a two-way
exchange of Close frames and then says of the peer that started it: "there is no guarantee that the
endpoint that has already sent a Close frame will continue to process data." When nobody managed a
Close frame at all, the browser reports 1006, which the RFC reserves "for use in applications
expecting a status code to indicate that the connection was closed abnormally, e.g., without sending
or receiving a Close control frame."

The protocol has no answer to "did you get it", because it was never asked to have one. RFC 6455
defines Ping and Pong, and a Pong "sent in response to a Ping frame must have identical 'Application
data' as found in the message body of the Ping frame". That is liveness for the connection, not
receipt for a message. There is no message id, no sequence number and no acknowledgement anywhere in
the frame format. If you want any of the three, you are writing them.

Which puts you in familiar territory: this is
[queues and delivery semantics](../systems/queues-and-delivery-semantics.md) with the broker taken
away. Send and forget is at-most-once. Hold each message until the far end names it, and resend on
reconnect, and you have at-least-once with duplicates to handle. Exactly-once delivery is off the
table here for the same reason it is off the table there, and a socket leaves you less to recover
with, because nothing is written down at either end unless you write it down.

Two mechanisms cover it, and which one you want depends on the direction.

**Acks, for client to server.** The client keeps an outbox. A message stays in it until the server
sends back an acknowledgement carrying that message's id, and on reconnect everything still in the
outbox goes again. The server therefore sees repeats and has to be idempotent, which is the same
claim-with-a-unique-index argument as [idempotency](../apis/idempotency.md).

**Offset and replay, for server to client.** The server numbers what it sends and keeps a window of
recent messages. The client remembers the last id it applied and names it on reconnect, and the
server replays the gap. Server-sent events has exactly this written into the specification, where the
browser resends the id as `Last-Event-ID` without being asked; see
[server-sent events](./server-sent-events.md). Over a socket both halves are application code.

The part people skip is the retention. The server's window costs memory per client, so it needs a
bound, and a bound means a client can come back asking for an offset that has fallen out of it. That
case needs an answer other than silence: send a snapshot and let the client start over from it.

## Worked example

One reconnect, and what it costs. The client sends #8 as the connection is dying, then #9 after it is
already gone.

```
       client                                     server
00:00  send #7  -------------------------------->  applied
00:00  ack #7   <--------------------------------  #7 leaves the outbox
00:04  send #8  -------------------------------->  applied, ack lost on the way back
00:04  the connection drops
00:05  send #9  readyState is CLOSED, so this is discarded without a sound
00:09  reconnect, resume from the last event applied
       #8 and #9 resent  ---------------------->   #8 arrives for the second time
```

Three different fates in four seconds, and none of them raised an error on the client. #7 is
confirmed. #8 was processed and the acknowledgement did not survive, which from the client's side is
indistinguishable from #8 never arriving. #9 never left the building.

The client half is an outbox and a resume marker:

```js
const outbox = new Map(); // id -> message, until the server names it
let lastAppliedId = 0;

function send(message) {
  outbox.set(message.id, message);
  flush();
}

function flush() {
  if (socket.readyState !== WebSocket.OPEN) return; // send() here goes nowhere, quietly
  for (const message of outbox.values()) socket.send(JSON.stringify(message));
}

socket.addEventListener('message', (event) => {
  const frame = JSON.parse(event.data);
  if (frame.type === 'ack') {
    outbox.delete(frame.id); // the only thing that makes forgetting it safe
    return;
  }
  lastAppliedId = frame.id;
  apply(frame);
});

socket.addEventListener('open', () => {
  socket.send(JSON.stringify({ type: 'resume', since: lastAppliedId }));
  flush(); // every unacked message goes again, so the server must tolerate repeats
});
```

The server owes three things in return: a reply to `resume` that replays from the named id or admits
it cannot, an ack for every message it has finished with, and a duplicate check that is decided by
the same write that does the work rather than by a read beforehand.

## Traps

**A message vanished and nothing anywhere reported an error.** It was sent into a socket that was
already closing, and the browser discarded it without a word. `CONNECTING` is the only state that
throws. Treat a successful `send()` as "handed over", check `readyState` before you rely on it, and
let the acknowledgement be the thing that says delivered.

**Reconnection works perfectly and the numbers are still wrong.** The socket comes back in under a
second, the UI stops saying disconnected, and the events from the gap are simply missing. Reconnecting
restores the pipe, not the contents. `EventSource` gets resumption from the specification;
a WebSocket gets nothing, so if the server is not numbering messages there is no offset to resume
from and no way to notice the hole.

**The same action happened twice after a blip.** A lost acknowledgement and a lost message look
identical from the client, so the outbox resends work the server already did. That is at-least-once
and it is the correct trade; the fix is at the other end. Give each message an id the client
generates once and reuses on every resend, and let a unique constraint decide whether it is new.

**Memory climbs after every network event and never comes back down.** The per-client retention
buffer has no cap, so a laptop that slept for an hour is still owed everything since it left. Bound
the window, and when a client asks for an offset that has aged out, send it a fresh snapshot instead
of replaying nothing and letting it believe it is caught up.
