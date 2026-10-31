---
title: CORS
question: Why does the browser block this when curl gets a 200?
order: 4
practise:
  - http-cors-expose-headers
  - http-cors-preflight
  - http-preflight-cache
  - security-cors-not-auth
  - security-cors-credentials
  - security-vary-origin-poisoning
sources:
  - author: WHATWG
    title: Fetch Standard
    url: https://fetch.spec.whatwg.org/
  - author: MDN
    title: Cross-Origin Resource Sharing (CORS)
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
  - author: MDN
    title: Access-Control-Allow-Origin
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin
  - author: MDN
    title: Access-Control-Allow-Headers
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Headers
  - author: MDN
    title: 'RequestInit: credentials'
    url: https://developer.mozilla.org/en-US/docs/Web/API/RequestInit
verified: 2026-08-01
---

Browsers stop a page on one site from reading responses from another site unless that other site
says it may. CORS is how a server gives that permission, and only browsers enforce it. That is why a
request can succeed from the command line and fail in the browser, and why these headers never stop
anyone from sending a request in the first place.

## The model

The same-origin policy is the default: a page can send a request to another origin, but it cannot
read the response. CORS is how the server says which origins may read it. Every part of the
enforcement lives in the browser. No other client on the internet consults these headers, which is
the single fact the rest of the page falls out of.

There are two paths, and which one you get is decided by the request, not by you.

**Straight through.** The browser sends the request immediately with an `Origin` header, then
withholds the response from script unless `Access-Control-Allow-Origin` matches. A request qualifies
when the method is `GET`, `HEAD` or `POST`; every header it carries is CORS-safelisted (`Accept`,
`Accept-Language`, `Content-Language`, `Content-Type`, `Range`) with a value under 128 bytes;
`Content-Type` is one of `application/x-www-form-urlencoded`, `multipart/form-data` or `text/plain`;
there is no upload progress listener on an `XMLHttpRequest` and no stream as the body. MDN notes the
old name for this, "simple request", comes from the obsolete CORS specification and the Fetch
Standard no longer uses it.

**Preflight.** Everything else, which in practice means every JSON API call and every request
carrying `Authorization`. The browser sends `OPTIONS` first with `Origin`,
`Access-Control-Request-Method` and `Access-Control-Request-Headers`, and expects a response naming
what is allowed: `Access-Control-Allow-Origin`, `-Allow-Methods`, `-Allow-Headers`, and optionally
`Access-Control-Max-Age` so the browser can reuse the answer instead of asking before every call.

Reading the response is gated separately. Script sees only the CORS-safelisted response headers by
default: `Cache-Control`, `Content-Language`, `Content-Length`, `Content-Type`, `Expires`,
`Last-Modified` and `Pragma`. Anything of your own, `X-Total-Count` included, has to be named in
`Access-Control-Expose-Headers`.

Credentials are a third axis. `fetch` defaults to `same-origin`, so cookies do not cross origins
unless you ask with `credentials: 'include'`, and then the server has to agree with
`Access-Control-Allow-Credentials: true` and an explicit origin. `*` fails, and a `*` in
`Access-Control-Allow-Headers` stops being a wildcard and is read as the literal header name `*`.

## Worked example

CORS by hand, so the moving parts are visible:

```js
const ALLOWED = new Set(['https://app.example.com']);

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && ALLOWED.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count');
    // The response depends on who asked, so a shared cache has to key on it.
    res.vary('Origin');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    res.sendStatus(204);
    return;
  }

  next();
});
```

Registered before the routes, and before the error handler, because a response that skips this
middleware is a response the browser will refuse to show whatever its status says.

## Traps

**"It works in curl."** It proves nothing, because curl is not a browser and nothing outside a
browser enforces CORS. The stronger version of the same mistake is treating
`Access-Control-Allow-Origin: *` as access control. For a request that skips preflight, the browser
already sent it and your server already ran it; all that was withheld is the response body from the
calling script. The write happened. CORS decides who may read an answer, never who may ask.

**Adding `Content-Type: application/json` produced an `OPTIONS` request that 404s.** That value is
off the safelist, so the call now preflights, and your router has to answer `OPTIONS` for that path.
A 404 or a 405 on the preflight fails the real request before it is ever sent, which is why the
symptom appears the moment you switch from a form post to a JSON body.

**The browser reports a CORS failure and the real problem is a 500.** Error responses need the CORS
headers too, and the error handler that formats them usually sits after the middleware that adds
them. `fetch` rejects with a `TypeError` that carries no status, so the actual failure is invisible
from JavaScript. Read the response in the network tab, not in the console.

**Cookies still are not sent, and `Allow-Origin: *` now fails outright.** Credentialed requests
demand an exact origin, which means echoing the request's `Origin` back after checking it against a
list. Echo it without adding `Vary: Origin` and any shared cache in front of you can hand one
origin's response to another, which turns a correctness fix into a security bug.
