---
title: Cache keys and Vary
question: The CDN says the hit rate is near zero. What is it keying on?
order: 4
practise:
  - http-preflight-cache
  - http-cache-control
  - security-authorization-caching
  - stock-lookup-express
sources:
  - author: IETF
    title: 'RFC 9111: HTTP Caching'
    url: https://www.rfc-editor.org/rfc/rfc9111.html
  - author: MDN
    title: Vary
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Vary
  - author: MDN
    title: HTTP caching
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching
  - author: MDN
    title: Access-Control-Max-Age
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Max-Age
verified: 2026-08-01
---

Caches file everything they store under a key, and a later request is answered from storage only
when its key matches. Put something unique to each visitor in the key and the cache keeps storing
copies nobody else can use. Leave out something the response really depends on and the opposite
happens: one visitor is handed a page built for someone else.

## The model

A cache is a dictionary, and everything it does well or badly follows from what is in the key.

RFC 9111 sets the floor: the cache key "is composed from, at a minimum, the request method and
target URI used to retrieve the stored response". Target URI includes the query string, so
`/pricing` and `/pricing?utm_source=twitter` are two objects that happen to have identical bodies.

`Vary` is how the server adds to that key. Naming `Accept-Language` in it, MDN says, "causes the
cache to be keyed based on a composite of the response URL and the `Accept-Language` request header"
instead of on the URL alone. RFC 9111 words the same thing as a matching rule, and that phrasing is
the one that explains the failure: a cache "MUST NOT use that
stored response without revalidation unless all the presented request header fields nominated by
that `Vary` field value match those fields in the original request". A stored entry that rarely
matches is a stored entry that is rarely used.

So the cost of a `Vary` is the number of distinct values the named header takes:

- `Vary: Accept-Encoding` — a small number of encodings, so the object is stored a few times over.
  This is the one you want.
- `Vary: Accept-Language` — one entry per language you actually serve, provided you normalise the
  header before it reaches the key.
- `Vary: User-Agent` — MDN warns it "generally has a very large number of variations, which
  drastically reduces the chance that the cache will be reused", and suggests feature detection
  instead.
- `Vary: Cookie` — a session cookie is unique per visitor, so no two people can ever share an entry.
  The cache still stores everything and serves almost none of it.
- `Vary: *` — RFC 9111: a stored response with `*` in its `Vary` "always fails to match". MDN puts
  it as: this implies the response is uncacheable.

The other half is what you are allowed to store at all. RFC 9111 keeps a shared cache honest without
your help on one case: it "MUST NOT use a cached response to a request with an `Authorization`
header field to satisfy any subsequent request" unless a directive such as `public`, `s-maxage` or
`must-revalidate` says otherwise. Cookies get no such protection, which is exactly why personalised
pages need `private` on them and not just a short lifetime.

## Worked example

The response that produces a 2% hit rate, and the one that fixes it:

```http
# Before: keyed on the visitor, so every entry is written once and read never.
HTTP/1.1 200 OK
Cache-Control: public, max-age=3600
Vary: Cookie, User-Agent, Accept-Encoding
```

```http
# After: the same object, stored once per encoding.
HTTP/1.1 200 OK
Cache-Control: public, max-age=3600
Vary: Accept-Encoding
```

That is only correct if the response really is the same for everyone, which is the decision `Vary`
was hiding. Split the two kinds of response apart and each gets an honest answer:

```http
# The shell, the assets, the marketing pages: shared, no personalisation in them.
Cache-Control: public, max-age=3600
Vary: Accept-Encoding

# The dashboard, which is different for every visitor.
Cache-Control: private, no-cache
```

`private` keeps it out of every shared cache; `no-cache` keeps the browser's own copy but makes it
ask before reusing it.

## Traps

**The hit rate is 2% and the CDN configuration looks right.** Read the response headers before you
read the configuration. `Vary` is often set by middleware rather than by the handler you are
looking at, and a `Vary: Cookie` that landed on responses with nothing to do with the session is the
usual answer. The CDN is doing exactly what it was told.

**One user is served another user's page.** The opposite failure, and worse. A personalised response
went out as `public` with no `Vary` and no `private`. Note that `no-cache` alone does not save you
here: MDN's request collapse describes a shared cache forwarding one request on behalf of many
identical simultaneous ones, and "even if `max-age=0` or `no-cache` is given in the response, it
will be reused" for that group. The directive that opts out is `private`.

**Every campaign link is a miss.** Tracking parameters are in the URI and therefore in the key, so
each source spawns a new object for a page whose content does not depend on them. Normalise at the
edge: drop the query parameters the origin never reads, and sort the ones it does.

**Two requests for every API call.** The `OPTIONS` preflight is answered from a different cache with
a different key. `Access-Control-Max-Age` sets how long the browser may reuse the
`Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` answer for that origin, method and
header set. The default is five seconds, and browsers cap what you ask for: MDN gives 24 hours for
Firefox and two hours for Chromium since version 76. `http-preflight-cache` is this one directly.
