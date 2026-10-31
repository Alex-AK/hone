---
title: What a header is
question: Where did the header I set go, and who was allowed to touch it on the way?
order: 1
practise:
  - http-content-type-charset
  - http-429-backoff
sources:
  - author: IETF
    title: 'RFC 9110: HTTP Semantics'
    url: https://www.rfc-editor.org/rfc/rfc9110.html#section-5
  - author: MDN
    title: HTTP headers
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers
  - author: Node.js
    title: 'HTTP: message.headers'
    url: https://nodejs.org/api/http.html#messageheaders
  - author: MDN
    title: 431 Request Header Fields Too Large
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/431
  - author: nginx
    title: 'ngx_http_core_module: underscores_in_headers'
    url: https://nginx.org/en/docs/http/ngx_http_core_module.html#underscores_in_headers
verified: 2026-08-01
---

Every request and response carries a set of labelled notes about the message: what format it is in,
who is asking, how long it may be kept. They sit apart from the content, which is what lets proxies
and caches act on a message without reading it. Anything on the path can also merge or drop those
notes, and your runtime changes how their names are spelled, so the one you set is not always the
one you read back.

## The model

A header is metadata about the message, not part of the resource. That is why the same bytes can
leave the server as JSON for one caller and gzipped CSV for another, and why a proxy can make
decisions about a response without understanding a word of the body.

Field names are case-insensitive. RFC 9110 says so directly, so `Content-Type`, `content-type` and
`CONTENT-TYPE` are one field, and code that compares a name against the casing it happened to
receive is wrong on a schedule. Runtimes normalise for you: Node lowercases every key in
`req.headers`, and the browser's `Headers` object matches without regard to case.

A field can appear more than once. When it does, the combined value is those field lines in the
order they arrived, joined with commas, so `Accept: text/html` followed by `Accept: application/json`
means the same thing as `Accept: text/html, application/json`. One field refuses to play along.
`Set-Cookie` appears once per cookie and does not use list syntax, and RFC 9110 names it as the
special case recipients have to handle separately.

Then there is how far a header travels. Most are end to end, and an intermediary passes them
through untouched. Some are for the next hop only: the `Connection` field lists them, an
intermediary removes them before forwarding, and RFC 9110 names the ones that should be removed or
replaced whether or not they are listed, including `Connection`, `Proxy-Connection`, `Keep-Alive`,
`TE`, `Transfer-Encoding` and `Upgrade`. That split is why `Content-Encoding` and
`Transfer-Encoding` are two headers rather than one: the first says what the representation is
compressed with all the way to the client, the second says how the bytes are framed on this one
connection. An intermediary is also required to add itself to `Via` on anything it forwards, which
is the closest thing to a free paper trail you get.

## Worked example

A client sends five header lines:

```
X-Request-Id: abc
X-Trace: one
X-Trace: two
Cookie: a=1
Cookie: b=2
```

Here is what the Node server reads:

```js
req.headers['X-Request-Id']; // undefined
req.headers['x-request-id']; // 'abc'
req.headers['x-trace']; // 'one, two'
req.headers['cookie']; // 'a=1; b=2'
```

Three rules in four lines. Keys are lowercased, so reading with the casing you wrote returns
`undefined` rather than an error. Repeats are joined with a comma. `Cookie` is joined with a
semicolon instead, because that is the syntax cookies use. On a response, `set-cookie` comes back as
an array, alone among headers, for the same reason.

Go through the framework and none of this bites. `req.get('X-Request-Id')` in Express matches
case-insensitively, and so does `headers.get('x-request-id')` in the browser.

## Traps

**The value is `undefined` and the network tab shows the header arriving.** You read it with the
casing you sent. Node lowercases every key, so `req.headers['X-Request-Id']` finds nothing while
`req.headers['x-request-id']` finds it. Use the accessor the framework gives you rather than
indexing the object, because that one does the case-insensitive match the protocol promises.

**It works locally and disappears in staging.** Something in the middle removed it. Two usual
causes. It was named in `Connection`, or is one of the fields an intermediary is expected to strip,
so it never got past the first hop. Or the name has an underscore in it: nginx defaults
`underscores_in_headers` to `off`, which marks `X_Request_Id` invalid, and `ignore_invalid_headers`
then drops it silently. Hyphens travel; underscores are a coin flip decided by someone else's
config.

**Two values arrived and one string came out.** Repeated fields are joined with a comma, so a value
that legitimately contains a comma is now indistinguishable from two values. This is exactly the
problem `Set-Cookie` has, which is why it is exempt from list syntax and why every runtime
special-cases it. If you are inventing a header, do not put user-controlled text in it and expect to
get it back intact.

**Requests start failing with 431, or the proxy answers 502 before your code runs.** Headers have
size limits, in the server and in every proxy in front of it, and the thing that grows without
anybody noticing is cookies. MDN documents 431 as covering both the total size of the request
headers and one oversized field. A user who cannot log in until they clear cookies is this, not a
session bug.
