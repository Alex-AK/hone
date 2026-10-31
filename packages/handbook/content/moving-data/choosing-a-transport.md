---
title: Choosing a transport
question: The data has to get from over there to over here. Which of these do I actually need?
order: 1
practise:
  - http-transport-queue
  - http-sse-vs-websocket
  - http-streaming-response
  - http-pagination-cursor
  - live-dashboard-sse
sources:
  - author: IETF
    title: 'RFC 9110: HTTP Semantics'
    url: https://www.rfc-editor.org/rfc/rfc9110.html
  - author: WHATWG
    title: 'HTML Standard: Server-sent events'
    url: https://html.spec.whatwg.org/multipage/server-sent-events.html
  - author: IETF
    title: 'RFC 6455: The WebSocket Protocol'
    url: https://www.rfc-editor.org/rfc/rfc6455.html
  - author: MDN
    title: WebSockets API
    url: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
verified: 2026-08-01
---

Getting data from one place to another can mean a plain request, a connection held open, a message
left on a queue, or a job that runs on a timer. Each suits a different situation, and the wrong pick
shows up later, usually as missed messages or as something that breaks when a second server is
added. A few plain questions about who starts the exchange and what happens when nobody is listening
usually settle it.

## The model

There is no list of protocols to memorise. There are four questions, and the answers pick the
transport for you.

**Who starts it?** The client, the server, or a clock. A client asking is a request. A server
announcing is a push, and a push needs a connection that was already open, or somewhere to deliver
to. A clock starting it is a job, and jobs are a different shape entirely.

**How many messages, and which way?** One question and one answer is a request. Many answers to one
question is a stream. Both sides talking whenever they like is a conversation. Most things that
feel like a conversation are actually a stream with a few buttons.

**What has to be true about delivery?** Does order matter? Does it matter if a message arrives
twice? What happens to a message sent while nobody is listening: is it lost, or does it wait? That
last one is the question that separates a transport from a queue.

**What does it cost?** A held-open connection is a file descriptor on every hop between you and the
server, and it stops the load balancer from moving you. Anything not plain HTTP is one more thing
that behaves differently behind a corporate proxy.

Answer those four and the choice is usually already made.

## Worked example

Three cases, worth knowing without thinking.

**A dashboard that updates.** The server starts it, messages go one way, losing one is survivable,
and the cost is one connection per viewer. That is server-sent events: an ordinary HTTP response
that stays open, with reconnection and resumption already written for you.

**A chat, or two people editing the same document.** Both sides start things, both directions carry
messages, and order matters within a conversation. That is a WebSocket, and the bill comes with it:
you write the reconnection, you decide what a reconnecting client has missed, and the moment there
are two server instances you need something in the middle for them to talk through.

**A file has to move, and then something has to happen to it.** The upload is a request: it has a
beginning, an end, and an answer. What happens next (transcode it, scan it, email someone) is not a
transport question at all. It is a job, and it goes on a queue, because the honest requirement is
"this must happen eventually" rather than "this must happen now".

Laid against the four questions:

|                    | Who starts it          | Directions             | If nobody is listening        | Cost                         |
| ------------------ | ---------------------- | ---------------------- | ----------------------------- | ---------------------------- |
| Request/response   | client                 | one exchange           | nothing to lose               | nothing held open            |
| Long polling       | client                 | one exchange, repeated | gap between polls             | a request in flight, always  |
| Server-sent events | server                 | server to client       | lost, unless you replay by id | one HTTP connection          |
| WebSocket          | either                 | both                   | lost, unless you buffer       | one connection, outside HTTP |
| Webhook            | somebody else's server | one exchange, inbound  | their retry policy, not yours | an endpoint you must keep up |
| Queue              | anything               | one way, deferred      | it waits                      | infrastructure               |

## Traps

**Reaching for a WebSocket because the word was "realtime".** The tell is that the client never
sends anything. You have paid for a two-way connection, given up automatic reconnection, and made
the load balancer sticky, all to do what an event stream does with less. Ask what the client sends
back. If the answer is "nothing", you want SSE.

**Calling it realtime when the data changes hourly.** A dashboard fed by a report that runs on the
hour does not need a transport at all; it needs a request when the page opens. A surprising share
of "we need realtime" is answered by a schedule and a refresh button, and the version that polls
every thirty seconds is one line of code with no operational story to tell.

**Forgetting that a held-open connection is state.** In-process state works until there are two
instances. One held-open connection lives on exactly one of them, so anything the other instance
wants to send has to get there somehow, and that means a shared bus, sticky routing, or both. This
is the cost that never appears in the tutorial and always appears in the incident.

**Assuming the connection stays up.** It will not. Proxies close idle connections, laptops sleep,
trains go into tunnels. The question is not whether you reconnect but what you do about the gap:
resume from a marker, refetch the current state, or accept the hole and say so in the UI. Deciding
that after launch means deciding it during an incident.
