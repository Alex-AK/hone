---
title: Storing a token
question: Should the session token live in a cookie or in localStorage, and what does each expose?
order: 4
practise:
  - security-samesite-none-secure
  - security-token-storage
  - security-cookie-flags
  - session-revocation-nestjs
sources:
  - author: MDN
    title: Set-Cookie header
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
  - author: MDN
    title: Using HTTP cookies
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies
  - author: MDN
    title: 'Window: localStorage property'
    url: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
  - author: IETF
    title: 'RFC 6265: HTTP State Management Mechanism'
    url: https://www.rfc-editor.org/rfc/rfc6265.html
  - author: IETF
    title: 'draft-ietf-httpbis-rfc6265bis-22: Cookies: HTTP State Management Mechanism'
    url: https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22
  - author: IETF
    title: 'RFC 6819: OAuth 2.0 Threat Model and Security Considerations'
    url: https://www.rfc-editor.org/rfc/rfc6819.html
  - author: OWASP
    title: Session Management Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
  - author: OWASP
    title: Cross-Site Request Forgery Prevention Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
  - author: Mozilla
    title: 'Bugzilla 1617609: Enable sameSite=lax by default'
    url: https://bugzilla.mozilla.org/show_bug.cgi?id=1617609
verified: 2026-08-02
---

After someone logs in, the browser has to keep something that proves it, and there are two places to
keep it: browser storage that your scripts can read, or a cookie the browser sends for you. Each
leaves a different door open. Storage hands the token to any script injected into your page, and a
cookie rides along on requests that other sites trigger.

## The model

**The two places a browser can keep a session token fail in opposite directions, and only one of
them has a cheap fix.** Storage is exposed to XSS, cookies to CSRF, and three cookie attributes
close most of CSRF for a line of config. No cookie attribute closes XSS.

`localStorage` and `sessionStorage` are scoped to an origin, and every script on that origin reads
them. OWASP says to keep no credential in either, because a single XSS vulnerability then discloses
every token. Neither is attached to a request for you, so your code sets the `Authorization` header
itself, which [authentication headers](../headers/authentication.md) covers.

A cookie inverts that. The server sends it once and the browser attaches it to every matching
request from then on, whether or not the code making the request knew it existed. That is why it
survives a reload, and why it also fires on a request another site provoked: CSRF exists because of
the attachment.

### The three attributes

`HttpOnly` hides the cookie from JavaScript APIs such as `document.cookie`. `Secure` sends it only
on `https:` requests (localhost excepted), and constrains transport and nothing else. `SameSite`
decides which cross-site requests carry it:

- `Strict` sends it only for requests from the site that set it. Arrive from a link on another site
  and you land logged out.
- `Lax` adds cross-site top-level navigations that use a safe method, which excludes `POST`, `PUT`
  and `DELETE`. A link click carries the cookie. A `fetch`, an `<img>` and an `<iframe>` navigation
  do not.
- `None` sends it everywhere, and the specification ignores the cookie unless it is also `Secure`.

Set `SameSite` explicitly, because the default is not settled. With the attribute absent, the
specification leaves the treatment to the browser: Chromium uses `Lax`, and Firefox closed that
change as WONTFIX and still uses `None`.

### HttpOnly is not a cure for XSS

An injected script cannot read an `HttpOnly` cookie and does not need to. MDN: "a cookie that has
been created with `HttpOnly` will still be sent with JavaScript-initiated requests, for example,
when calling `XMLHttpRequest.send()` or `fetch()`." The script calls your API from your own page,
and the request looks like one the user made. What the flag buys is narrow and real: without it, the
attacker takes a credential home and replays it after the tab is closed. With it, they act as the
user only while their code runs on your page.

### Prefixes, scope and lifetime

`__Secure-` and `__Host-` commit a cookie to a set of attributes, and a `Set-Cookie` that breaks the
promise is dropped rather than corrected. `__Secure-` needs `Secure`. `__Host-` also needs no
`Domain` and `Path=/`, which pins the cookie to the host that set it, as close to an origin boundary
as cookies get. OWASP recommends it for session IDs.

`Domain` only ever widens: omit it and the cookie goes to the host that set it and not its
subdomains, set it and every subdomain is included. Omit both `Max-Age` and `Expires` and you get a
session cookie, which ends when the browser says the session ended.

### Revocation, and where in-memory fits

An opaque session id is a lookup key, so deleting the server's row ends the session on the next
request. A self-contained JWT is checked by signature, so there is nothing to delete and it is valid
until it expires. RFC 6819 draws the same line between handles and assertions. The mitigation is a
short-lived access token plus a refresh token the server can revoke at any time, leaving exposure
only until the access token expires.

The in-memory option follows from both halves: the access token in a variable that is never
persisted, the refresh token in a `__Host-` cookie with `HttpOnly` and `Secure`. No store on the
origin holds a credential, and the long-lived half is revocable, at the cost of a loading state on
every cold start. An injected script can still call the refresh endpoint, so this narrows the window
rather than closing it.

## Worked example

The cookie a session id should ship as, where `Path=/` and the absent `Domain` are not choices but
what the `__Host-` prefix demands:

```http
Set-Cookie: __Host-session=<opaque-id>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600
```

What each store hands to a script that should not be running:

```js
localStorage.getItem('token'); // the token, to any script on the origin
document.cookie; // '' for the HttpOnly cookie: not in this string, by design

// and the part HttpOnly does not stop, from that same injected script:
await fetch('/api/transfer', {
  method: 'POST',
  body: JSON.stringify({ to: 'attacker', amount: 5000 }),
}); // same-origin, so the browser attaches the cookie and the server sees the user
```

The in-memory pattern, with the cookie doing the persisting:

```js
let accessToken = null; // dies on reload, which is the point

async function authedFetch(path, init = {}) {
  if (!accessToken) {
    // nothing to send: the __Host- refresh cookie is attached by the browser
    const res = await fetch('/auth/refresh', { method: 'POST' });
    if (!res.ok) throw new Error('Session expired'); // revoked, or no refresh cookie
    accessToken = (await res.json()).accessToken;
  }
  const headers = { ...init.headers, Authorization: `Bearer ${accessToken}` };
  return fetch(path, { ...init, headers });
}
```

## Traps

**You moved the token out of `localStorage` into an `HttpOnly` cookie and the pentest still lands.**
The finding was XSS, and the storage change never touched it: the injected script now spends the
token on a same-origin `fetch` instead of reading it. Fixing storage limits what an attacker takes
home; only [stopping the injection](./untrusted-input-becomes-code.md) stops it.

**The `Set-Cookie` header is right there in devtools and the cookie is nowhere.** The browser
rejected it whole, silently. Usual causes: a `__Host-` name sent with a `Domain` or a `Path` other
than `/`, `SameSite=None` without `Secure`, or `Secure` over plain `http` on a host that is not
localhost. The specification says "abort this algorithm and ignore the cookie entirely", so there is
no half-applied state to inspect.

**Nobody hit CSRF in testing and the report finds it anyway.** The cookie has no `SameSite`
attribute and the tester used Firefox, where an absent attribute still means `None`, so Chromium's
`Lax` default was covering for you. Set the attribute, and treat it as the second layer regardless:
OWASP says `SameSite` is defense in depth and does not replace a proper CSRF defense in most
deployments, because `Lax` still permits a cross-site top-level GET.

**The user pressed log out, the UI cleared, and their old token still works.** The token is a
self-contained JWT, so logging out deleted the client's copy and nothing else. The server consults
no store, so a token captured earlier stays good until its `exp`. Keep server-side state you can
delete, or shrink the gap with a short lifetime and a revocable refresh token.

**The marketing subdomain got compromised and the main app's sessions went with it.** Somebody set
`Domain=example.com` to share a login across hosts, so every subdomain receives the session cookie,
third-party hosting included. The reverse holds without any sharing: a subdomain can write a cookie
scoped to the parent, and the parent cannot tell it from its own. Drop `Domain` and use `__Host-`.

**Users report staying logged in for weeks, and the session cookie has no `Expires`.** A session
cookie ends when the browser decides the session ended, and a browser that restores tabs on launch
restores those cookies with them. Set `Max-Age`, and give the server-side record its own lifetime:
the cookie's expiry is only the client's opinion.
