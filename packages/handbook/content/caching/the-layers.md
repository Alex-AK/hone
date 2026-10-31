---
title: The layers
question: Something on the screen is out of date. Which cache is holding it?
order: 1
practise:
  - http-age-header
  - http-cache-control
  - http-etag-conditional
  - slow-list-endpoint-kysely
sources:
  - author: MDN
    title: HTTP caching
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching
  - author: IETF
    title: 'RFC 9111: HTTP Caching'
    url: https://www.rfc-editor.org/rfc/rfc9111.html
  - author: web.dev
    title: Service worker caching and HTTP caching
    url: https://web.dev/articles/service-worker-caching-and-http-caching
  - author: PostgreSQL
    title: Resource Consumption
    url: https://www.postgresql.org/docs/current/runtime-config-resource.html
verified: 2026-08-01
---

Your data is copied and kept at several points on its way from the database to the screen: in the
browser, at servers spread around the world, in front of your app and inside it. Each copy saves
work, and each one goes out of date on its own schedule. When something on screen is wrong, the
first job is finding which copy is serving it, because each layer is cleared a different way and a
fix aimed at the wrong one changes nothing.

## The model

A single `GET /api/orders` can be answered by eight things, and only the last of them is your
handler. In the order they get asked:

```
  browser memory cache    per tab, gone when it closes. Chrome puts it in front
                          of the service worker; the details are unspecified
  service worker          your JavaScript, your Cache API, your rules
  browser disk cache      the HTTP cache. survives a restart
- - - - - - - - - - - - - the network - - - - - - - - - - - - - - - - - - - -
  CDN edge                one per point of presence, so "the CDN" is really n caches
  reverse proxy           nginx, Varnish, the ingress in front of your pods
- - - - - - - - - - - - - your code starts here - - - - - - - - - - - - - - -
  application             a Map in module scope, or Redis
  ORM                     identity map, prepared statements
  database buffer pool    shared_buffers, and under it the OS page cache
```

RFC 9111 names only two kinds. A private cache is "dedicated to a single user"; a shared cache
"stores responses for reuse by more than one user". Everything above the network line is private,
the two below it are shared, and `Cache-Control` is the language you speak to both. Nothing from
the application down has heard of `Cache-Control` and none of it will honour a header.

That split is the first cut when something is stale. The second cut is which side of the network
line the stale copy lives on, and you can find that out in two commands rather than by reasoning:

- **Only you see it, and a colleague does not.** A private cache. Yours.
- **Everyone sees it, including a browser that has never visited the site.** The network line or
  below.
- **Only some regions see it.** A CDN edge, because each one stores separately.
- **A restart or a deploy fixes it, briefly.** In-process memoisation, whose lifetime is the
  process.
- **It survives a restart and `curl` against the origin still shows it.** The application's own
  store, the ORM, or the data itself.

## Worked example

Ask the edge, then ask the origin. Two requests narrow it to one side of the network line.

```
$ curl -sI https://shop.example.com/api/orders
HTTP/2 200
cache-control: public, max-age=60
age: 47
etag: "8f21c"
```

`Age` is the giveaway. RFC 9111 defines it as the sender's estimate of the time since the response
was generated or validated at the origin, so a non-zero `Age` means something in the middle
answered, not your server. This copy has 13 of its 60 seconds of freshness left. Now go around it:

```
$ curl -sI https://origin.shop.example.com/api/orders
HTTP/2 200
cache-control: public, max-age=60
age: 0
```

Same body, `age: 0`. The edge is innocent and the stale value is coming out of your application,
your ORM or your database. If the origin had been correct, the search would have ended at the edge
instead, and the fix would have been a header or a purge rather than a code change.

## Traps

**"It's fine for me after a hard reload", and it ships.** A hard reload clears exactly one layer,
the private one, for exactly one person. Every other visitor is still being answered by the edge,
which holds its own copy with its own clock. Worse, MDN notes that Chrome does not revalidate
subresources during a reload, so the HTML you just forced can still be pointing at a script the
browser did not recheck.

**The second run is always faster, so the optimisation looks like it worked.** Time the endpoint,
add an index, time it again, and it is several times quicker. Part of that is the index and part is
that Postgres now has those pages in `shared_buffers`, with the operating system's cache underneath
holding them too. The Postgres docs are explicit that it relies on the OS cache as well as its own
buffers, so a repeated benchmark is measuring two warm layers you did not control for.
`slow-list-endpoint-kysely` refuses to judge on a stopwatch for this reason: it logs every statement
and reads `EXPLAIN` output, so an index the planner ignores counts as no index at all.

**A header that stops at the network line.** The response says `no-store`, the value is still wrong,
and the conclusion is that caching is broken. It isn't. `no-store` governs HTTP caches. The `Map`
in module scope, the Redis entry, the ORM's identity map and the buffer pool never see the header
and would not act on it if they did. Each of those has its own lifetime and its own way of being
cleared, and you have to name which one before you can fix anything.
