---
title: Content negotiation
question: Who decides what format comes back, and why does everybody sometimes get the wrong one?
order: 2
practise:
  - http-post-json
  - http-content-type-charset
  - node-content-length-bytes
sources:
  - author: IETF
    title: 'RFC 9110: HTTP Semantics, section 12'
    url: https://www.rfc-editor.org/rfc/rfc9110.html#section-12
  - author: MDN
    title: Content negotiation
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Content_negotiation
  - author: MDN
    title: Vary
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Vary
  - author: MDN
    title: Content-Encoding
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Encoding
  - author: MDN
    title: HTTP caching
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching
  - author: IETF
    title: 'RFC 8259: The JavaScript Object Notation (JSON) Data Interchange Format'
    url: https://www.rfc-editor.org/rfc/rfc8259.html
verified: 2026-08-01
---

One address can serve the same thing in more than one form: as JSON or as CSV, compressed or not, in
English or in French. The client says what it would like and the server picks one. The response then
has to admit what the choice depended on, or a cache in the middle hands whichever version it stored
first to everybody.

## The model

One URL, more than one representation. Negotiation is how the two ends agree on which one, and it
runs in three parts.

The client states preferences up front. `Accept` for media types, `Accept-Encoding` for compression,
`Accept-Language` for languages, each an ordered list with optional quality values from 0 to 1,
where an absent `q` means 1. RFC 9110 calls this proactive negotiation, and it is the only kind you
will meet in practice.

The server picks one representation and describes what it picked. `Content-Type` gives the media
type and its parameters, `Content-Encoding` names the compression applied on top, `Content-Language`
the language. `Content-Encoding` is end to end and describes the resource itself, so when it is
present `Content-Length` counts the compressed bytes, not the original. On a request these same
headers describe the body you are sending rather than the one you want back.

Then the response has to admit what the choice depended on. That is `Vary`: a list of request header
names that fed into the selection. A cache keys stored responses on the URL, and `Vary` extends that
key to include the named headers. `Vary: Accept-Language` means the copy stored for a Spanish
speaker will not be handed to a French one. No `Vary` means the cache believes the URL is the whole
story, and hands the first response it saw to everybody.

## Worked example

An endpoint that serves the same report as JSON or CSV:

```js
app.get('/report', (req, res) => {
  // The answer depends on this request header, so say so before choosing.
  res.vary('Accept');

  const accept = req.get('accept') ?? '*/*';
  if (accept.includes('text/csv')) {
    res.type('text/csv').send(toCsv(report));
    return;
  }
  if (accept.includes('application/json') || accept.includes('*/*')) {
    res.json(report);
    return;
  }
  res.sendStatus(406);
});
```

The `res.vary('Accept')` is the line people leave out, and it is the one that decides whether a
shared cache can serve this URL correctly at all.

The substring test is a shortcut worth knowing the limits of. A browser navigating to this URL sends
`Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`, and curl sends `*/*`.
Ranking those properly means parsing the list and sorting by `q`, which is what a negotiation
library is for. Two acceptable types with different weights is where the shortcut gives the wrong
answer.

## Traps

**The endpoint returns JSON in curl and an HTML error page in the browser.** Nothing changed except
`Accept`. curl asks for `*/*` and takes whatever arrives; the browser asks for HTML first and only
falls back to `*/*` at `q=0.8`, so a server that honours the ranking answers each of them
differently. When you are debugging a format problem, compare the two `Accept` headers before you
read any application code.

**Some users get a body they cannot decode, or everybody gets the French copy.** The response was
correct when it was generated and a cache stored it under the URL alone. Anything that varies the
response by a request header needs that header in `Vary`, and `Accept-Encoding` is the one that
matters most: without it a cache can hand a gzipped body to a client that never asked for one. This
is a cache-key bug, not a serialisation bug, and the tell is that it depends on who got there first.

**`Vary` fixed correctness and destroyed the hit rate.** Every distinct value of a listed header is
a separate stored entry, so `Vary: Cookie` splits the cache per session and `Vary: User-Agent`
splits it per browser build. MDN's caching guide is explicit about both: use `Cache-Control: private`
for responses personalised by cookie, and vary behaviour on feature detection rather than the user
agent string.

**415 Unsupported Media Type on a POST with a perfectly good JSON body.** The body is fine and
`Content-Type` is missing or wrong, so the server's body parser never claimed the request. The same
header has a second job you did not ask for: its value decides whether a cross-origin request needs
a preflight, because only `application/x-www-form-urlencoded`, `multipart/form-data` and
`text/plain` skip one. Worth knowing that `application/json` registers no `charset` parameter at
all, and RFC 8259 requires JSON exchanged between systems to be UTF-8, so
`application/json; charset=utf-8` is noise that compliant recipients ignore.
