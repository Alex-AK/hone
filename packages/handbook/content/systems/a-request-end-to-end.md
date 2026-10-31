---
title: What happens on a request
question: What actually happens between the address bar and the first byte back?
order: 1
practise:
  - sys-request-lifecycle
  - http-timeout-fetch
sources:
  - author: MDN
    title: Populating the page, how browsers work
    url: https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/How_browsers_work
  - author: MDN
    title: TCP handshake
    url: https://developer.mozilla.org/en-US/docs/Glossary/TCP_handshake
  - author: MDN
    title: Connection management in HTTP/1.x
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Connection_management_in_HTTP_1.x
  - author: MDN
    title: rel=preconnect
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/preconnect
  - author: IETF
    title: 'RFC 8446: The Transport Layer Security (TLS) Protocol Version 1.3'
    url: https://www.rfc-editor.org/rfc/rfc8446.html
  - author: web.dev
    title: Time to First Byte (TTFB)
    url: https://web.dev/articles/ttfb
  - author: web.dev
    title: Content delivery networks (CDNs)
    url: https://web.dev/articles/content-delivery-networks
  - author: Donne Martin
    title: System Design Primer
    url: https://github.com/donnemartin/system-design-primer
verified: 2026-08-01
---

Before your server sees a request, the browser has already traded messages back and forth to find
the server's address and open a secure connection to it. Each of those exchanges crosses the network
and back, and its cost depends on distance rather than on your code. That is how a request that is
quick in your server's own log can still feel slow to a user far away.

## The model

Before the server has read a single byte of your request, the browser has already waited out three
separate exchanges: one to find out where to go, and two to get the door open. Naming them is the
point of this card, because almost everything else in this section is a way of not paying for one.

In order, on a cold start:

- **DNS** — you have a name and need an address. The browser asks its resolver, and if the resolver
  does not have the answer it goes and asks the servers that do, while you wait for all of it. The
  answer is then cached, in the browser, in the OS and in the resolver, for as long as the
  record's TTL says.
- **TCP** — SYN, SYN-ACK, ACK. Nothing can be sent until the third of those three messages, so the
  connection costs a round trip before it carries anything.
- **TLS** — on HTTPS, another exchange on top of the one that finished a moment ago, agreeing a
  cipher and a key. TLS 1.3 added a resumption mode that RFC 8446 describes as "saving a round trip
  at connection setup for some application data, at the cost of certain security properties": early
  data is not forward secret and has no non-replay guarantee, so it is for requests that are safe to
  send twice.
- **The request** — now it goes out, and the first byte back is a round trip plus whatever the
  origin spent. That total is what TTFB measures, and web.dev counts exactly these phases in it:
  redirects, the service worker, DNS, connection and TLS negotiation, then the request itself.

What answers is usually not your origin. A CDN edge is the first thing the address resolves to, and
its value here is round trips rather than bytes: the edge is nearer, so every exchange above is
shorter, and TLS ends there instead of at your server. On a hit, the origin is never asked at all.
On a miss it fetches from the origin over the CDN's own routes, which web.dev describes as "reliable
and highly optimized" rather than whatever BGP would have picked. Behind it sit a reverse proxy and
a load balancer, which pick an instance ([load balancers](./load-balancers.md)) and leave your
handler serving plain HTTP with the client's address demoted to a header
([proxies and identity](../headers/proxies-and-identity.md)).

Inside the origin the round trips carry on where no browser tool will show them. Every query is a
hop to another machine, which is why pooled connections matter: a pooled one skips the connect and
the auth that a fresh one repeats
([one thread, many connections](../server-runtime/one-thread-many-connections.md)). The response
then comes back out through every layer that forwarded it, each of which may keep a copy
([the layers](../caching/the-layers.md)).

The second request to the same host is a different animal. The connection is still open, so DNS, TCP
and TLS are all skipped: persistence is the default in HTTP/1.1, and HTTP/2 puts parallel requests
down that one connection. `<link rel="preconnect">` exists to buy that warm state early, doing the
DNS, TCP and TLS work for an origin before anything needs it.

## Worked example

The same request, cold and warm. `R` is one round trip to whatever machine is named.

```
cold, https, nothing cached
  DNS       resolver       R    more if the resolver has to go and ask
  TCP       edge           R    SYN, SYN-ACK, and only then may the client send
  TLS       edge           R    tls 1.3; resumption can spend 0, at a cost
  request   edge           R    plus the origin's own work on a cache miss
                          ───
                          4R + origin time, before the first byte

warm, connection still open
  request   edge           R
                          ───
                          1R + origin time
```

Which of those is actually costing you is one command, and the phases come out as differences:

```
$ curl -s -o /dev/null \
  -w '%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer}\n' \
  https://example.com

  time_namelookup                        DNS
  time_connect       - time_namelookup   TCP handshake
  time_appconnect    - time_connect      TLS handshake
  time_starttransfer - time_appconnect   request out, origin's work, first byte back
```

## Traps

**The endpoint takes 40ms in the handler's own log and 400ms in the browser.** The handler starts
timing after everything on this page has already happened, and stops before the response has gone
back through it. Measure at the client instead: that number includes DNS, both handshakes and any
queueing in front of your process.

**A one-line DNS change took hours to reach some users.** Every cache that answered before your edit
keeps its old answer until the TTL expires, and there is nothing you can send them to make it
happen sooner. Lower the TTL well before the change, then raise it after.

**The API is fine from the office and slow from another continent, with identical server timings.**
Server time is the same because the work is the same. What changed is the distance each of those
round trips crosses, and three of them happen before the request has even gone out. That is the case
for an edge, and for holding connections open rather than establishing them again.

**The spinner never stops, and nothing is in the error log.** The request stalled at one of these
hops, and no layer imposed a deadline: `fetch` has no timeout of its own, so the promise stays
pending. Give every call a deadline with `AbortSignal.timeout`, and see
[failure and retries](../server-runtime/failure-and-retries.md) for what to do when it fires.
