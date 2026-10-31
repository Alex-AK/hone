---
title: API versioning and lifecycle
question: What counts as a breaking change, where does the version go, and how do I retire one?
order: 3
practise:
  - http-breaking-change-tightening
  - http-version-in-path-or-header
  - http-version-header-vary
  - http-deprecation-vs-sunset
  - http-retired-version-410
  - http-put-vs-patch
sources:
  - author: GitHub
    title: API Versions
    url: https://docs.github.com/en/rest/about-the-rest-api/api-versions
  - author: Stripe
    title: Upgrade your API version
    url: https://docs.stripe.com/upgrades
  - author: IETF
    title: 'RFC 9745: The Deprecation HTTP Response Header Field'
    url: https://www.rfc-editor.org/rfc/rfc9745.html
  - author: IETF
    title: 'RFC 8594: The Sunset HTTP Header Field'
    url: https://www.rfc-editor.org/rfc/rfc8594.html
verified: 2026-08-01
---

Once other people's code calls your API, every change you ship is a change to their program as
well. Versioning is how you keep changing it anyway: you decide which changes are safe to make in
place, put the rest behind a new version, and eventually switch the old one off. The trouble comes
from changes that did not look breaking, and from old versions still in use that nobody is
counting.

## The model

A version is a promise about a contract. You need a new one when you break the promise, so the
question "where does the version go" is downstream of the question nobody asks first, which is what
counts as breaking.

Both of the APIs that carry the most third-party integrations publish their answer, and the two
lists agree. Stripe reserves the right to add resources, add optional request parameters, add
response properties, reorder response properties, change the length or format of opaque strings such
as object IDs and error messages, and add event types, all without a new version. GitHub's
non-breaking list is the same shape: adding an operation, adding optional parameters, adding
response fields. GitHub's breaking list is the mirror image: removing an operation, removing or
renaming parameters, adding required parameters, changing authentication requirements.

The rule underneath: **you can add, you cannot remove or tighten.** Tightening is the half that gets
missed, because it does not look like an API change. Narrowing which values an enum accepts,
promoting an optional field to required, changing a default, and adding validation to a field that
used to wave junk through are all breaking, and none of them show up as a removed endpoint. So is
removing a field from a response that a client is reading, which is why "clients must tolerate
fields they do not recognise" belongs in your documentation on day one rather than in the incident
review.

Then, where it goes. Three places, and the trade is the same each time.

- **The path** (`/v2/reports`). Visible, routable by anything that can read a URL, trivial to try in
  a browser. It versions the whole surface at once, so one endpoint's breaking change drags every
  client onto new URLs, and the same resource now has two identities, which matters for caching and
  for anything that stores links.
- **A request header** (`X-GitHub-Api-Version: 2022-11-28`, `Stripe-Version`). The URL is stable, so
  a resource keeps one identity and a client can move one call at a time. Costs: invisible in an
  address bar, and every cache in the path has to `Vary` on it or a v1 response gets served to a v2
  client.
- **The media type** (`Accept: application/vnd.example.v2+json`). Content negotiation used as
  designed. Correct, and rare, because client tooling makes it awkward.

Anyone carrying many external integrations ends up at the header. GitHub's version is a date, and a
request without the header gets a documented default rather than the newest release. Stripe pins an
account to a version on its first request and lets a single call override it, which is what makes an
incremental migration possible.

Retirement is three steps, and only the first two have HTTP support. Announce, instrument, then turn
off. `Deprecation` (RFC 9745) carries the date a resource was or will be deprecated, as a structured
field date, which looks like `Deprecation: @1688169599`. `Sunset` (RFC 8594) carries the date it is
expected to stop responding, as an HTTP date, and must not be earlier than the deprecation date. RFC
9745 also registers a `deprecation` link relation, so the response can point at the migration guide.
Both are hints. Neither turns anything off, and no client library reads them for you.

Instrumentation is the step people skip and the only one that tells you what happens when you turn
the version off. Count requests per version per client. GitHub supports each version for at least 24
months after its successor ships and answers a request for a retired version with `410 Gone`, which
is a better ending than a `404` because it says the resource existed and is intentionally finished.

## Worked example

A deprecated version, still answering, saying so on every response:

```http
GET /reports/9f2 HTTP/1.1
Host: api.example.com
X-Api-Version: 2024-11-01

HTTP/1.1 200 OK
Content-Type: application/json
Deprecation: @1751328000
Sunset: Wed, 01 Jul 2026 23:59:59 GMT
Link: <https://docs.example.com/api/2026-migration>; rel="deprecation"; type="text/html"
```

And after the sunset date, with the client that ignored all of it:

```http
HTTP/1.1 410 Gone
Content-Type: application/json

{
  "error": "api_version_retired",
  "message": "Version 2024-11-01 was retired on 2026-07-01.",
  "docs": "https://docs.example.com/api/2026-migration"
}
```

Two things the server has to do that are not in the headers. It has to `Vary: X-Api-Version` so no
cache mixes the two shapes, and it has to log the version and the client on every request, because
the decision to turn it off is a number rather than a date.

## Traps

**Adding a field broke a client.** The addition was safe by every published rule, and the client
validated its responses with unknown fields rejected. This is the argument for saying in your
documentation, before you have any clients, that responses grow and clients must ignore what they do
not recognise. It is also the argument for testing your own SDK against a response with an extra
field in it.

**Everything is `/v3` because one endpoint changed.** Path versioning versions the surface, not the
endpoint, so a breaking change to one resource reprints every URL in your documentation and every
link a client stored. If most of your changes are local to one resource, that cost repeats.

**A v2 client got a v1 response.** The version moved to a header and something in the path cached on
URL alone. Any header that changes the representation has to appear in `Vary`, and this failure is
intermittent by nature: it only shows up once both versions are warm in the same cache.

**The sunset date passed and the traffic did not.** `Deprecation` and `Sunset` are hints in a
response nobody is reading, and an integration written three years ago has no maintainer to read
them. Email the account owners, and instrument the endpoint so that "who breaks" is a list of names
rather than a guess. If you cannot answer that question, you are not ready to switch it off.
