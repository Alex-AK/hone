---
title: Conditional requests and ranges
question: The download died at 80% and starts from zero every time. How do I ask for just the rest?
order: 7
practise:
  - http-range-next-chunk
  - conditional-requests-express
  - http-etag-conditional
  - http-sse-resume
sources:
  - author: IETF
    title: 'RFC 9110: Conditional Requests'
    url: https://www.rfc-editor.org/rfc/rfc9110.html#section-13
  - author: IETF
    title: 'RFC 9110: Range Requests'
    url: https://www.rfc-editor.org/rfc/rfc9110.html#section-14
  - author: MDN
    title: HTTP range requests
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests
  - author: MDN
    title: If-Range header
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/If-Range
  - author: MDN
    title: Using server-sent events
    url: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
verified: 2026-08-02
---

Instead of asking for a whole file every time, a client can attach a condition, such as only if it
has not changed, or ask for one slice of it. Together those let a dropped download pick up where it
stopped rather than starting over. Done carelessly, the resumed file is quietly stitched together
from two different versions, with no error to show for it.

Which validator to send, how to compute one cheaply, and what `304` saves you is
[revalidation](../caching/revalidation.md). This page is the other side of it: what a client does with
a validator in hand, and what it takes to ask for part of something.

## The model

A conditional request is an ordinary request with a precondition attached. Do this only if the copy I
am talking about is still the copy you have. RFC 9110 defines five of them, and they differ by what
they are protecting:

- `If-Match` — strong comparison, for writes. A mismatch is `412`, which is lost-update protection.
- `If-Unmodified-Since` — the date-shaped version of the same thing.
- `If-None-Match` — weak comparison, for reads. A match is `304` on GET and HEAD, `412` on anything
  else.
- `If-Modified-Since` — the date-shaped version, ignored outright when `If-None-Match` is present.
- `If-Range` — for range requests, and neither `304` nor `412`. A mismatch gets you the whole thing.

The order they are evaluated in is fixed by the spec rather than left to the server: `If-Match`, then
`If-Unmodified-Since` if `If-Match` is absent, then `If-None-Match`, then `If-Modified-Since` if
`If-None-Match` is absent, then `If-Range`. RFC 9110 gives the reasoning, and it is a good summary of
what the five are for: lost update preconditions have stricter requirements than cache validation, a
validated cache is more efficient than a partial response, and entity tags are presumed to be more
accurate than date validators.

**Ranges.** `Range: bytes=0-499` asks for the first 500 bytes. Offsets are zero-based and both ends
are inclusive, so the first 500 bytes end at 499. Two other forms exist: `bytes=500-` is everything
from offset 500 onward, and `bytes=-500` is a suffix, meaning the last 500 bytes rather than
everything but the last 500. A satisfied request gets `206 Partial Content` with
`Content-Range: bytes 0-499/1234`, where the figure after the slash is the complete length, or `*` if
the server does not know it. An unsatisfiable one gets `416` with `Content-Range: bytes */1234`.

None of it is guaranteed. Ranges are an optional feature of HTTP: a server may ignore the `Range`
field, an origin server must ignore a range unit it does not understand, and a server may reject range
sets it reads as abusive. `Accept-Ranges: bytes` advertises support and `Accept-Ranges: none` says do
not bother, but the advice is only advice, and RFC 9110 tells clients they "MUST NOT assume that
receiving an Accept-Ranges field means that future range requests will return partial responses".

`If-Range` is the piece that makes resumption safe. If the representation changed while you were
disconnected, splicing fresh bytes onto stale ones produces a corrupt file with no error attached to
it. `If-Range` says: send the range if this validator still holds, otherwise send the whole current
representation. `If-Match` would answer a mismatch with `412` and cost you a second request, and
short-circuiting that is the entire reason `If-Range` exists. It takes a strong entity tag or a strong
date, compared exactly, prefix and all.

Ranges address bytes at an offset in something that has a length, which rules out an open stream. A
`text/event-stream` resumes with `Last-Event-ID`, the same job done by a different mechanism, and
`http-sse-resume` is that rep.

## Worked example

A 1234-byte file behind Express 5.2.1, served by `res.sendFile`. Every exchange below is a real one:

```
GET /file
200  Accept-Ranges: bytes   ETag: W/"4d2-19fc563f301"   Content-Length: 1234

GET /file   Range: bytes=0-99
206  Content-Range: bytes 0-99/1234         Content-Length: 100

GET /file   Range: bytes=-100
206  Content-Range: bytes 1134-1233/1234    Content-Length: 100

GET /file   Range: bytes=5000-6000
416  Content-Range: bytes */1234

GET /file   Range: bytes=0-9,20-29
200  Content-Length: 1234

GET /file   Range: items=0-9
200  Content-Length: 1234

GET /file   Range: bytes=0-99   If-None-Match: W/"4d2-19fc563f301"
304  (no body)
```

The first three are the mechanism working, including the suffix form resolving to an absolute range in
`Content-Range`. The last four are the ones that catch people, and all four are correct behaviour. Two
ranges in one request would need a `multipart/byteranges` body, which Express does not build, so it
sends the whole file with a `200`. An unrecognised range unit must be ignored, which is a `200` as
well. And preconditions are evaluated before the range, so a client that sends both its cache
validator and its resume offset gets a `304` and no bytes: the spec says `Range` is ignored when a
conditional GET would have produced a `304`.

`4d2` is 1234 in hex and the rest of that tag is the file's modification time. Express derives it from
size and mtime, which is why it ships marked weak.

The other half of the example is the handler that does none of this. `res.json(...)` ignores `Range`
and sends no `Accept-Ranges` at all, and so does a handler that sets `Accept-Ranges: bytes` by hand
and then calls `res.send(body)`: `200` and the full body, every time. Ranges belong to the
file-serving layer, not to being HTTP.

## Traps

**The resumed file is corrupt and every response in the trace was a `206`.** There was no `If-Range`,
so nothing checked that the two halves came from the same version. The bytes after the seam are from
the representation that exists now and the bytes before it are from the one that existed an hour ago.
Send the validator alongside the `Range` and the server either honours the range or answers `200` with
the whole current representation, which is your signal to throw away what you had.

**Resumption never engages and the transfer restarts from zero.** The validator is weak. RFC 9110
forbids a client from putting a weak entity tag in `If-Range` and requires the strong comparison
function to evaluate it, under which a weak tag matches nothing. Express's `res.sendFile` issues
`W/"4d2-19fc563f301"` by default, so the only validator it hands out is one a client is not allowed to
use. Express's own file server accepts the weak tag it issued and answers `206`, which means local
testing looks fine while a spec-following client or a CDN in front of it does not resume at all.
Whatever you send has to be the tag byte for byte: the same tag with `W/` stripped off gets a `200`
and the entire file.

**You asked for 100 bytes and 5 MB arrived, with a `200` on it.** The three legal refusals are
indistinguishable from the client side: an ignored `Range`, an unrecognised unit, and a multi-range
request the server would not assemble. None of them is an error, so there is nothing to catch. Branch
on the status instead. `206` means read `Content-Range` and write at that offset, `200` means discard
the partial file and start over, `416` means your offset is past the end of something that has shrunk.

**`bytes=-500` returned the last 500 bytes and you wanted to skip them.** HTTP has no negative offset.
`bytes=-500` is the suffix form and `bytes=500-` is the open-ended one, and both ends of
`bytes=first-last` are inclusive. A 500-byte read at offset N is `bytes=N-(N+499)`. Off by one here is
one byte duplicated or dropped at every seam, so the damage scales with how many times the connection
dropped rather than showing up on the first try.
