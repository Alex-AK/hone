---
title: The redirect you did not validate
question: The `next` parameter starts with a slash, so why is that not enough?
order: 5
practise:
  - security-open-redirect-relative-check
  - security-open-redirect
sources:
  - author: OWASP
    title: Unvalidated Redirects and Forwards Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html
  - author: WHATWG
    title: URL Standard
    url: https://url.spec.whatwg.org/
  - author: MDN
    title: 'URL: URL() constructor'
    url: https://developer.mozilla.org/en-US/docs/Web/API/URL/URL
  - author: MDN
    title: 'URL: origin property'
    url: https://developer.mozilla.org/en-US/docs/Web/API/URL/origin
  - author: MDN
    title: 'Location: assign() method'
    url: https://developer.mozilla.org/en-US/docs/Web/API/Location/assign
  - author: MDN
    title: Referer header
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referer
  - author: IETF
    title: 'RFC 9700: Best Current Practice for OAuth 2.0 Security'
    url: https://datatracker.ietf.org/doc/html/rfc9700
verified: 2026-08-02
---

Plenty of apps send you back to where you were after logging in, using a parameter in the link that
names the destination. If the app does not check that destination properly, anyone can build a link
that starts on your site and ends on theirs. That makes a strong phishing tool, because the link
looks trustworthy and the fake page appears while your real login is still fresh in the user's mind.

## The model

**A redirect check holds only if it reads the URL the way the browser's parser does, and string
checks do not.** OWASP describes the bug as an app redirecting to a URL contained in untrusted
input. What makes it worth an attacker's time is that the link genuinely begins on your domain, so
it survives a careful look at the hostname, a mail filter that trusts your domain and a proxy
allowlist that trusts it too.

### The forms that beat a string check

Each is a real string a query parameter can hold, and each resolves against a base of
`https://your-site.com/login` to an origin of `https://evil.com`.

**`//evil.com` is protocol-relative.** It starts with a slash, so `next.startsWith('/')` says yes.
The parser reads the two slashes as the start of an authority, takes `evil.com` as the host, and
inherits the scheme from the base.

**`/\evil.com` swaps one slash for a backslash.** For `http` and `https`, which the URL Standard
calls special schemes, the parser treats the two characters the same way. It reports a validation
error and carries on, so the result is `//evil.com` by another spelling.

**`https:/\evil.com` contains no `://` at all.** A check that searches for that substring, or splits
on it, finds nothing to reject. The parser lands in the same place.

**`https://your-site.com@evil.com` puts your domain in the userinfo.** Everything before the `@` is
a username and password, so the host is `evil.com`. A check that asks whether the string contains
`your-site.com` passes it, and so does a person reading the left-hand end of the URL.

**Leading whitespace and embedded tabs are removed before parsing starts.** The URL Standard strips
leading and trailing C0 controls and spaces, and every tab or newline. A space in front of
`//evil.com` is gone before the host is read, and a tab between the two slashes rejoins them. Only
the literal characters are stripped, so a percent-encoded `%09` stays part of the path.

### The check that holds

`new URL(next, base)` runs the same parser, so it agrees with the browser by construction. A
relative value resolves against your base, and an absolute one keeps its own origin, which is the
distinction you want to test. Then compare `origin`, a normalised string, rather than searching the
input. None of the forms above survives it, and MDN notes that anything not a hierarchical URL has
the origin `"null"`, so `javascript:` and `data:` fail without a rule of their own.

The stronger version never parses a URL. OWASP suggests having the user supply a short name or ID
that maps server-side to the full target. The parameter becomes `next=settings`, and what it can
mean is a table you wrote.

### The same bug on the client

`location.assign(next)`, `location.href = next` and an `href` built from user input are the same
hole with a different sink. On the client, a `javascript:` URL in any of those places executes
rather than navigates, which makes it XSS as well, the subject of
[where untrusted input becomes code](./untrusted-input-becomes-code.md). The origin comparison
already rejects it.

### OAuth's version of the same parameter

`redirect_uri` is a destination named in a query parameter, with an authorization code attached to
the outcome. RFC 9700: "When comparing client redirection URIs against pre-registered URIs,
authorization servers MUST utilize exact string matching except for port numbers in localhost
redirection URIs of native apps". It records that prefix and wildcard matching were tried and proved
more complex and more error-prone. A loose match sends the code to the attacker's domain, and the
code exchanges for tokens, so RFC 9700 also requires public clients to use PKCE, which binds the
code to the client that started the flow.

### What leaks on the way out

A token in the query string of the URL you redirect to becomes the page's address, and MDN says
`Referer` can carry the path and query string onward.
[Security headers](../headers/security-headers.md) covers how `Referrer-Policy` narrows that; the
cheaper fix is to keep the token out of the URL.

## Worked example

The bypasses, run rather than argued. In a JavaScript string literal `'/\\evil.com'` is the string
`/\evil.com`:

```js
const BASE = 'https://your-site.com/login';

new URL('//evil.com', BASE).origin; // 'https://evil.com', and it starts with '/'
new URL('/\\evil.com', BASE).origin; // 'https://evil.com', and it starts with '/'
new URL('https:/\\evil.com', BASE).origin; // 'https://evil.com', with no '://' in the string
new URL('https://your-site.com@evil.com', BASE).origin; // 'https://evil.com'
new URL(' //evil.com', BASE).origin; // 'https://evil.com', the leading space went first
new URL('javascript:alert(1)', BASE).origin; // 'null'
```

The check, on the server:

```js
const SITE = 'https://your-site.com';

function safeNext(next, fallback = '/') {
  if (typeof next !== 'string' || next === '') return fallback;

  let url;
  try {
    url = new URL(next, SITE); // relative values get SITE, absolute values keep their own
  } catch {
    return fallback; // not a URL at all
  }

  if (url.origin !== SITE) return fallback; // 'null' covers javascript: and data:
  return url.pathname + url.search + url.hash; // rebuilt from parsed parts, not the input string
}

res.redirect(safeNext(req.query.next));
```

Returning the path rather than `url.href` is deliberate: the `Location` header gets something you
assembled from parsed components, not a string that merely passed a test.

When the destinations are known ahead of time, there is nothing to parse:

```js
const DESTINATIONS = new Map([
  ['settings', '/account/settings'],
  ['billing', '/account/billing'],
]);

res.redirect(DESTINATIONS.get(req.query.next) ?? '/');
```

## Traps

**The reported link is on your domain and the page the user describes is not.** `?next=//evil.com`
passed a `startsWith('/')` check, because it does start with a slash, and the URL parser read the
second slash as the start of a host. Resolve the value with `new URL(next, SITE)` and compare
`origin` instead of inspecting the raw string.

**The check passed and the value had a backslash in it.** For `http` and `https` the parser treats
`\` as `/`, so `/\evil.com` and `https:/\evil.com` both reach `evil.com` while looking nothing like
an absolute URL. String surgery would have to reproduce the special-scheme grammar in full, so let
the parser do it and check the parsed result.

**A `next.includes('your-site.com')` check passed on a link that went to evil.com.** Your domain was
in the userinfo, before an `@`, so it was a username. `url.host` is the only part of a URL that
decides where the request goes, and comparing `origin` reads it from the parse rather than the text.

**The unit test rejects the payload and the browser follows it anyway.** The test handed your check
the string as written. The browser stripped a leading space, a C0 control character or an embedded
tab before parsing, so the parser saw something shorter than what you validated. Parse first and
decide second, so the thing you inspect is the thing the browser will act on.

**Assigning the value to `location.href` popped an alert.** The parameter held a `javascript:` URL,
which executes in the page's own origin rather than navigating anywhere, so an open redirect on the
client is also stored XSS if the value is ever saved. The origin comparison rejects it for free:
`new URL('javascript:…', SITE).origin` is the string `'null'`, which never equals your site.

**The identity provider accepted a `redirect_uri` you never registered.** The registered value was
treated as a prefix or held a wildcard, so `https://app.example.com.evil.com/cb` matched
`https://app.example.com`. RFC 9700 requires exact string matching for this reason, with one
carve-out for localhost ports in native apps. Register every callback URI in full, path included.
