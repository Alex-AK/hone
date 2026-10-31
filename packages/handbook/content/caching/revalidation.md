---
title: Revalidation
question: The client already has this. How do I avoid sending it again?
order: 3
practise:
  - http-stale-while-revalidate
  - conditional-requests-express
  - http-etag-conditional
  - http-cache-control
  - react-fetch-race
sources:
  - author: MDN
    title: HTTP caching
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching
  - author: MDN
    title: ETag
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag
  - author: IETF
    title: 'RFC 9110: HTTP Semantics'
    url: https://www.rfc-editor.org/rfc/rfc9110.html
  - author: IETF
    title: 'RFC 5861: HTTP Cache-Control Extensions for Stale Content'
    url: https://www.rfc-editor.org/rfc/rfc5861.html
verified: 2026-08-01
---

A stored copy that has gone stale does not have to be thrown away. The cache can ask the server
whether it is still current, and if nothing has changed the server answers with a short yes instead
of sending everything again. That saves the download but not the trip, and it only saves the server
any work if it can answer the question without building the whole response first.

## The model

Freshness and validation are two mechanisms, not one. Freshness says how long a stored copy may be
used without asking anybody: `max-age` sets the lifetime, `Age` counts against it, and the response
is fresh until the age exceeds the lifetime. Validation is what happens afterwards. Instead of
downloading the thing again, the cache asks whether what it holds is still current.

That question is a conditional request, and it needs a validator, which the server sends with the
200:

- `ETag` — an opaque string the server picks. MDN notes there are no restrictions on how it is
  generated, so a content hash or a revision number are both fine.
- `Last-Modified` — a date, at one-second resolution.

The client sends it back on the next request as `If-None-Match` or `If-Modified-Since`. Unchanged
means `304 Not Modified` with no body, and the cache restarts the freshness clock on the copy it
already has. Changed means an ordinary 200. Prefer `ETag`: a date cannot express two changes inside
the same second, and MDN notes RFC 9110 would rather you sent both when you can.

**Weak and strong.** An `ETag` prefixed with `W/` is weak. RFC 9110 defines the strong side: a strong
validator "is representation metadata that changes value whenever a change occurs to the
representation data that would be observable in the content of a 200 (OK) response to GET". MDN puts
the weak side in the terms you meet it: weak values "might be semantically equivalent, but not
byte-for-byte identical". Weak is the honest label for "same content, different bytes". It costs you range requests, which need a strong validator to stay cacheable, and it costs
you nothing on a 304, because RFC 9110 requires `If-None-Match` to use the weak comparison function:
two tags match if their opaque parts match character by character, whether or not either is marked
weak.

**`stale-while-revalidate`.** RFC 5861 adds the directive that answers "is stale worse than slow?"
with "not for the next few minutes":

```http
Cache-Control: max-age=60, stale-while-revalidate=600
```

For 60 seconds the response is fresh and served with no request at all. For the 600 after that, a
cache may serve the stored copy immediately and revalidate in the background, so the unlucky request
that discovered the staleness does not pay for it. Past 660 seconds staleness is real again and the
next request waits. RFC 5861's other extension, `stale-if-error`, does the same trick for a 500, 502,
503 or 504 from upstream: keep serving the old copy rather than passing the error on.

## Worked example

A large JSON resource that is polled and rarely changes:

```
GET /report                          ->  200  ETag: "a1b2c3"   [ 400 KB ]
GET /report  If-None-Match: "a1b2c3" ->  304                   [ no body ]
```

The handler, with the freshness policy on the same response:

```js
app.get('/report', async (req, res) => {
  // Cheap: a version, not a hash of the rendered body.
  const version = await currentReportVersion();
  const etag = `"${version}"`;

  res.set('ETag', etag);
  res.set('Cache-Control', 'max-age=60, stale-while-revalidate=600');

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end(); // no body, and nothing was built to produce it
  }

  res.json(await buildReport());
});
```

What that saves is the body, not the round trip. If the round trip is the cost you care about,
validation is the wrong tool: `max-age` skips the request entirely while it lasts, and
`stale-while-revalidate` skips the waiting once it does not.

## Traps

**Every request returns 304 and the server is still on fire.** The validator was computed by
building the response first, so you saved the bandwidth and none of the work. A 304 is only cheap if
the ETag is cheap: a version column, an `updated_at`, a counter bumped on write. Hashing the
rendered body means you rendered the body.

**Nothing is a hit after a deploy.** The ETag is derived from something that is not the content, so
every instance and every release invents a new one for bytes that never changed. The validator has
to be a function of the representation, not of the machine or the build that served it, or two
servers behind a load balancer will disagree about a file they both hold identical copies of.

**A 304 that never fires, and the header looks right.** Comparing `If-None-Match` with `===` works
until a `W/` appears on one side. The spec requires weak comparison for this header, which ignores
the prefix on either or both tags; a string equality does not. The header can also carry a
comma-separated list, or `*`. Parse it rather than matching it.

**The stale render is replaced by an older one.** Client caches like React Query and SWR implement
this whole page in JavaScript: show what is stored, refetch in the background, swap in the result.
Two of those in flight and the slower, older response lands last. That is `react-fetch-race` wearing
a different costume, and the fix is the same one: ignore or abort any response that is not for the
request you last made.
