---
title: Authentication headers
question: Do I put the token in an Authorization header or a cookie?
order: 3
practise:
  - http-401-vs-403
  - security-token-storage
  - jwt-auth-express
  - auth-guard-nestjs
sources:
  - author: MDN
    title: Authorization
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Authorization
  - author: MDN
    title: Set-Cookie
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
  - author: IETF
    title: 'RFC 6265: HTTP State Management Mechanism'
    url: https://www.rfc-editor.org/rfc/rfc6265.html
  - author: IETF
    title: 'RFC 6750: The OAuth 2.0 Authorization Framework, Bearer Token Usage'
    url: https://www.rfc-editor.org/rfc/rfc6750.html
  - author: WHATWG
    title: Fetch Standard
    url: https://fetch.spec.whatwg.org/
verified: 2026-08-01
---

Logging in produces a token, and something has to present it again on every request after that.
Either your code attaches it by hand, or the browser stores it as a cookie and attaches it for you.
Which one does the attaching decides which attacks you are open to, and explains why a login can
work from a testing tool and fail in the browser.

## The model

HTTP does not remember you, so identity has to ride along on every request. There are two ways to
carry it, and the real difference is who attaches it.

`Authorization: <scheme> <credentials>`. The scheme is case-insensitive. `Basic` is base64 of
`user:password`, which is encoding and not encryption, so it is only ever safe over TLS. `Bearer`,
defined by RFC 6750, means what it says: any party in possession of the token can use it exactly as
any other holder could. MDN notes the header is usually sent after a `401` carrying a
`WWW-Authenticate` challenge, though APIs normally skip the dance and send it up front. Your code
attaches this header, deliberately, on requests it makes. Nothing attaches it for you, which is a
security property: a request your app did not initiate does not carry it.

Cookies invert that. The server sends `Set-Cookie` once, and from then on the browser attaches
`Cookie: session=…; theme=dark` to every matching request, whether or not the code making that
request knew a cookie existed.

`Set-Cookie` is unlike every other header in four ways, and each one catches somebody:

- **One line per cookie.** RFC 6265 says origin servers should not fold multiple `Set-Cookie` fields
  into one, and RFC 9110 lists it as the field that violates the comma list syntax everything else
  follows. Node reflects that faithfully: `res.headers['set-cookie']` is an array while every other
  repeated header is a joined string.
- **Its value is instructions, not data.** `Expires`, `Max-Age`, `Domain`, `Path`, `Secure`,
  `HttpOnly` and `SameSite` are directions to the client about when to send the thing back.
- **Script can never read it.** The Fetch Standard defines `Set-Cookie` as a forbidden response
  header name that must be filtered out of any response exposed to frontend code, so
  `response.headers.get('set-cookie')` is `null`. `Cookie` is a forbidden request header name too,
  so script cannot set it either.
- **The two directions are not symmetric.** Several `Set-Cookie` lines go out; one `Cookie` line
  comes back, semicolon separated, with no attributes and no indication of which response set what.

Cookies are also weaker than they look. RFC 6265 states plainly that they are isolated neither by
port nor by scheme, and offer no integrity against sibling domains.

## Worked example

The bearer half, from the jwt-auth-express workout:

```js
const [scheme, token] = (req.headers.authorization ?? '').split(' ');
if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Missing bearer token' });

try {
  // jwtVerify, never decodeJwt: decoding reads the claims of any token at all,
  // including one you did not sign.
  const { payload } = await jwtVerify(token, SECRET_KEY, { algorithms: ['HS256'] });
  req.user = findUserById(Number(payload.sub));
} catch {
  res.status(401).json({ error: 'Invalid token' });
}
```

The cookie half is one header and no client code at all:

```js
res.setHeader(
  'Set-Cookie',
  `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`
);
```

`HttpOnly` keeps the value out of `document.cookie`, so an injected script cannot read it. It does
not stop that script from spending it: a `fetch` from the same page still gets the cookie attached
by the browser.

## Traps

**The token works in Postman and returns 401 from the browser.** `Authorization` is not one of the
headers CORS treats as safe, so a cross-origin request carrying it always preflights, and the server
has to name it in `Access-Control-Allow-Headers`. A `*` there will not do: MDN states that
`Authorization` is never covered by the wildcard and always has to be listed explicitly. The other
half of this symptom is redirects, since the header is stripped when a redirect crosses origins.

**Login succeeds and the very next request is anonymous.** The cookie was set and not sent back.
`fetch` defaults its credentials mode to `same-origin`, so a cross-origin call needs
`credentials: 'include'`, and then the server needs `Access-Control-Allow-Credentials: true` and an
explicit origin rather than `*`. Locally, a `Secure` cookie over plain `http` is the same symptom
with a different cause.

**`response.headers.get('set-cookie')` is `null` even though the header is right there in devtools.**
It is filtered from every response exposed to script, by specification, same-origin included. There
is no flag for this. If the frontend needs to know a session started, the response body has to say
so.

**The session works perfectly and another site can spend it.** That is the cookie doing its job:
attached to any request to your origin, including one another page provoked, which is CSRF. Most
browsers now treat a cookie with no `SameSite` attribute as `Lax`, which covers the classic
cross-site POST but still sends the cookie on a top-level GET navigation. State-changing requests
need something the other site cannot guess or copy. A bearer token in a header has this problem the
other way round: nothing sends it for you, and nothing keeps it out of `localStorage` where an
injected script can read it.
