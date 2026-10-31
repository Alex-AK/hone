---
title: HTTP/1.1, 2 and 3
question: Requests are queueing up behind each other. Which version fixes that, and which one only half fixes it?
order: 3
practise:
  - sys-request-lifecycle
  - sys-latency-vs-throughput
sources:
  - author: IETF
    title: 'RFC 9112: HTTP/1.1'
    url: https://www.rfc-editor.org/rfc/rfc9112.html
  - author: IETF
    title: 'RFC 9113: HTTP/2'
    url: https://www.rfc-editor.org/rfc/rfc9113.html
  - author: IETF
    title: 'RFC 9114: HTTP/3'
    url: https://www.rfc-editor.org/rfc/rfc9114.html
  - author: IETF
    title: 'RFC 9000: QUIC: A UDP-Based Multiplexed and Secure Transport'
    url: https://www.rfc-editor.org/rfc/rfc9000.html
  - author: MDN
    title: Head-of-line blocking
    url: https://developer.mozilla.org/en-US/docs/Glossary/Head_of_line_blocking
  - author: MDN
    title: Connection management in HTTP/1.x
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Connection_management_in_HTTP_1.x
  - author: Chrome for Developers
    title: Removing HTTP/2 Server Push from Chrome
    url: https://developer.chrome.com/blog/removing-push
verified: 2026-08-01
---

Each newer version of HTTP changed what makes requests wait behind one another. The oldest one in
use queues them behind any slow response. Its successor fixes that but lets a single lost packet
stall everything sharing the connection, and the newest fixes that in turn by leaving the old
transport behind. Knowing which kind of waiting you have tells you whether an upgrade helps or makes
things worse.

## The model

Three versions chasing the same problem down two layers of the stack. The problem is called
head-of-line blocking, and there are two of them. Knowing which one you have is the difference
between an upgrade that helps and an upgrade that makes things worse.

**HTTP/1.1 blocks at the request level.** Connections are persistent by default, so you can reuse
one for request after request, but you get one exchange at a time. Pipelining was the attempt at
more: send the next request without waiting for the last response. It barely helps, because RFC 9112
requires a server to "send the corresponding responses in the same order that the requests were
received". One slow response holds up every response queued behind it, including the ones that
finished first. Browsers routed around this with parallelism rather than protocol, and MDN puts the
common limit at six connections per domain. That number is why the seventh request waits.

**HTTP/2 fixes that with multiplexing.** Requests and responses become interleaved streams on one
connection, each independently numbered, so a slow response no longer occupies a lane. RFC 9113's
introduction says what it is fixing: HTTP/1.1's pipelining "only partially addressed request
concurrency and still suffers from application-layer head-of-line blocking". The spec recommends a
concurrent stream limit "no smaller than 100", so six stops being the ceiling. Headers are
compressed with HPACK on the same reasoning, since they repeat almost verbatim across requests.

**What HTTP/2 does not fix is TCP.** RFC 9113 states it in one sentence: "TCP head-of-line blocking
is not addressed by this protocol." TCP hands the layer above it a single ordered byte stream, and
it cannot deliver byte 900 until byte 400 arrives. RFC 9114 spells out what that costs: "Because the
parallel nature of HTTP/2's multiplexing is not visible to TCP's loss recovery mechanisms, a lost or
reordered packet causes all active transactions to experience a stall regardless of whether that
transaction was directly impacted by the lost packet." Every stream waits, including the ones whose
bytes already arrived.

That has a sharp edge on the upgrade path. HTTP/1.1 spread the work over six connections, so one
lost segment stalled roughly a sixth of it. HTTP/2 puts everything on one connection, so one lost
segment stalls all of it. Multiplexing is still the better trade on a good network; on a bad one it
concentrates the damage.

**HTTP/3 fixes the second problem by leaving TCP.** The same HTTP semantics ride on QUIC, which runs
over UDP and does loss recovery per stream rather than per connection. MDN: "QUIC runs multiple
streams over UDP and implements packet loss detection and retransmission independently for each
stream, so that if an error occurs, only the stream with data in that packet is blocked." QUIC also
folds the TLS handshake into the transport handshake, which RFC 9000 describes as being there "to
minimize connection establishment latency".

So HTTP/2 solved head-of-line blocking at the request level and HTTP/3 solved it at the transport
level. Neither solved it at your database, which is where most of a real waterfall sits.

## Worked example

Thirty small assets on one domain, and what each version does with them.

|          | What happens to thirty requests                                                      | The advice that went with it                                                    |
| -------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| HTTP/1.1 | six connections, one exchange at a time on each, so five waves                       | concatenate into one file, and shard across `cdn1`/`cdn2` for more connections  |
| HTTP/2   | one connection, thirty interleaved streams, at least a hundred allowed at once       | stop sharding; the concatenation argument is now about caching, not round trips |
| HTTP/3   | the same, and a dropped packet stalls only the asset whose bytes were in that packet | nothing new to do, but check it is being used at all                            |

"Bundle everything" expired because the cost it was buying off was per connection, not per file: a
handshake, and a place in a queue six deep. Multiplexing removes both.

What did not expire is the caching half of the same argument, which is a different argument wearing
the same clothes. One bundle is one cache entry, so changing one line re-downloads all of it.
Thirty files are thirty entries that expire independently. That trade-off survived the protocol
change intact, and it is the one still worth arguing about.

## Traps

**The site got slower on hotel wifi after the HTTP/2 upgrade.** Everything now shares one TCP
connection, and TCP delivers in order, so a single lost segment stalls all of it until the
retransmission arrives. Before the upgrade, six connections meant a loss cost you one lane. This is
not a misconfiguration and there is no HTTP/2 setting for it: the fix is HTTP/3, where each stream
recovers from loss on its own.

**DevTools says h2 on a server you configured for HTTP/3.** A client cannot assume HTTP/3 is
available. It finds out, typically from an `Alt-Svc: h3=":443"` header on an earlier response over
TCP, and only then tries QUIC. QUIC is UDP, and plenty of corporate networks drop it: RFC 9114 says
"Connectivity problems (e.g., blocking UDP) can result in a failure to establish a QUIC connection;
clients SHOULD attempt to use TCP-based versions of HTTP in this case." The fallback is silent and
correct, which is exactly why you should read the protocol column before crediting HTTP/3 with
anything.

**Assets still split across three subdomains.** The symptom is HTTP/2 being switched on and nothing
getting faster. Every extra origin costs another DNS lookup, another connection and another TLS
handshake, and it splits the streams that were meant to share one connection and one compression
context. MDN is blunt about it: "In HTTP/2, domain sharding is no longer useful... Domain sharding
is even detrimental to performance."

**Waiting for server push to save the round trip.** It is gone. Chrome disabled HTTP/2 server push
by default in Chrome 106, and other Chromium browsers followed. Chrome's own post gives the numbers:
1.25% of HTTP/2 sites used it, 0.7% in a later analysis, and the measurements came back "without a
clear net performance gain and in many cases performance regressions". What replaced it is hinting
rather than telling, with `103 Early Hints` and `rel=preload`. Both leave the browser to decide
whether it already has the file, which is the check push could never make.
