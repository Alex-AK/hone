---
title: Security headers
question: Which of these security headers actually stops an attack, and which ones are theatre?
order: 6
practise:
  - security-csp-unsafe-inline
  - security-hsts-redirect
  - security-nosniff-mime
  - security-referrer-policy
  - security-sri
sources:
  - author: MDN
    title: Content Security Policy (CSP)
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP
  - author: MDN
    title: 'Content-Security-Policy: script-src directive'
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src
  - author: MDN
    title: 'Content-Security-Policy: frame-ancestors directive'
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors
  - author: MDN
    title: Content-Security-Policy-Report-Only header
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy-Report-Only
  - author: W3C
    title: Content Security Policy Level 3
    url: https://www.w3.org/TR/CSP3/
  - author: MDN
    title: Strict-Transport-Security header
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security
  - author: IETF
    title: 'RFC 6797: HTTP Strict Transport Security (HSTS)'
    url: https://www.rfc-editor.org/rfc/rfc6797.html
  - author: Chromium
    title: HSTS Preload List Submission
    url: https://hstspreload.org/
  - author: MDN
    title: X-Content-Type-Options header
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options
  - author: MDN
    title: Referrer-Policy header
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy
  - author: W3C
    title: Referrer Policy
    url: https://www.w3.org/TR/referrer-policy/
  - author: MDN
    title: Subresource Integrity
    url: https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Subresource_Integrity
  - author: MDN
    title: X-XSS-Protection header
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-XSS-Protection
  - author: MDN
    title: X-Frame-Options header
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options
verified: 2026-08-02
---

On every page load the browser makes a few security decisions for you: which scripts to run, whether
to trust the file type the server claimed, how much of the address to tell other sites, and whether
to talk over an unencrypted connection. A handful of response headers let you change those answers.
Some close real attacks, some are leftovers that do nothing or make things worse, and the ones that
work tend to break something the day you turn them on.

## The model

**Each header overrides a decision the browser was going to make anyway, so ask of each what the
default was and what breaks when you change it.** Cookie attributes and output encoding are the same
job in a different shape, and they live in [storing a token](../security/storing-a-token.md) and
[where untrusted input becomes code](../security/untrusted-input-becomes-code.md).

### Content-Security-Policy

`script-src` is an allowlist of sources JavaScript may load from, and anything else does not
execute. Inline script has no source to match, so it is outside the allowlist by default, and MDN
notes inline event handlers such as `onclick="…"` are blocked too. That is what catches XSS, because
an injected payload nearly always lands as inline script.

`'unsafe-inline'` is a blanket exception: every inline script and handler runs, and the browser
cannot tell yours from the one that arrived in a comment. To keep specific inline scripts without
it, use a **nonce**, a random value in the policy echoed on the tags you trust and unique for each
HTTP request, or a **hash** of the exact script text. Browsers act on either: "If a directive
contains nonce or hash expressions, then the `unsafe-inline` keyword is ignored by browsers." So add
the nonce, watch nothing break, then delete the keyword. `'strict-dynamic'` passes that trust on to
the scripts a trusted script loads, and makes the browser ignore allowlist expressions such as
`'self'`.

`default-src` is the fallback for directives you do not list, but `frame-ancestors`, which names who
may embed you in a frame, does not fall back. MDN: "A policy that declares `default-src 'none'`
still allows the resource to be embedded by anyone." CSP Level 3 has it supersede `X-Frame-Options`.

### Strict-Transport-Security

A redirect from `http://` to `https://` arrives too late: the first request already crossed the
network in plaintext, and the redirect comes back over the connection an attacker controls. HSTS
moves the decision into the browser, which upgrades later `http://` attempts before opening a
connection. `max-age` counts seconds from when the browser received the header, and
`includeSubDomains` extends the policy to every subdomain. The first visit stays unprotected unless
you `preload`, which is not in RFC 6797: it puts you on a list browsers ship inside the binary.

It is hard to reverse. Turning HSTS off means serving `max-age=0`, which takes effect only once a
browser makes a secure request and reads it, and MDN notes you cannot disable HSTS over plain HTTP.
Leaving the preload list takes months to reach Chrome users.

### X-Content-Type-Options

MIME sniffing is the browser reading a response's first bytes and deciding it knows the type better
than you. A file served as `text/plain` that starts with `<!doctype html>` gets treated as a page,
which turns an upload endpoint into a way to host HTML on your origin. `nosniff` says your types are
deliberate. For a script or style request it blocks a response without a JavaScript MIME type or
`text/css`, so the script fails to load. For everything else, navigations included, the browser uses
your `Content-Type` as-is. It takes your word, so your word has to be right: serve uploads as
`application/octet-stream` with `Content-Disposition: attachment`.

### Referrer-Policy

The browser sends `Referer` on requests made from a document as well as navigations away from it, so
a pixel, a font or an analytics `fetch` carries it. With no header, modern browsers apply
`strict-origin-when-cross-origin`: the full URL to your own origin, only the origin to another site
over HTTPS, nothing from HTTPS to HTTP. `unsafe-url` sends the full URL everywhere. No policy makes
a URL safe for a secret, which still sits in history and proxy logs, so a password reset token
belongs in a POST body or a short-lived single-use code.

### Subresource integrity

This one is an HTML attribute, and it finishes what CSP starts: CSP says where script may come from,
SRI pins what those bytes have to be, so a compromised CDN on your allowlist is still caught.
`integrity` holds a base64 hash prefixed with its algorithm (`sha256`, `sha384` or `sha512`), and
bytes that do not match are refused with a network error. A cross-origin load also needs
`crossorigin`, because checking hashes on a `no-cors` load would let an attacker learn a resource's
content by watching which loads succeed.

### The ones that are gone

`X-Frame-Options` is superseded: `DENY` and `SAMEORIGIN` still work, but modern browsers ignore the
header entirely when it says `ALLOW-FROM`.

## Worked example

Four headers on every response, with the CSP split across lines for reading:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-8IBTHwOdqNKAWeKl' 'strict-dynamic';
  frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

The nonce is the only moving part, and it moves on every request:

```js
const csp = (nonce) =>
  `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; frame-ancestors 'none'`;

app.use((req, res, next) => {
  // New for every response. A value that repeats is an allowlist entry an
  // attacker can read out of view-source and paste into their own tag.
  res.locals.nonce = randomBytes(16).toString('base64');
  res.setHeader('Content-Security-Policy', csp(res.locals.nonce));
  next();
});
```

The template echoes that value onto the tags it trusts, and pins the one it does not own:

```html
<script nonce="{{ nonce }}">
  startApp();
</script>
<script
  src="https://cdn.example.com/chart-4.4.1.js"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
  crossorigin="anonymous"
></script>
```

There is no `X-XSS-Protection`, because a CSP without `'unsafe-inline'` is the control that header
guessed at, and no `X-Frame-Options`, because `frame-ancestors` covers it. On a site not built for a
policy, send the CSP as `Content-Security-Policy-Report-Only` with a `report-to` endpoint first.

## Traps

**The nonce is in the header, the nonce is on the tag, and the script is blocked anyway.** The two
came from different responses. Either the nonce was generated once at boot or baked into a build, so
it repeats and stops being unguessable, or a CDN cached the HTML while the header stayed dynamic. It
has to be unique per request and identical in header and markup within one response.

**A subdomain that was never migrated is unreachable, and stays that way for a year.**
`includeSubDomains` applied the policy to every name under the domain and `max-age=31536000` told
browsers to remember it for one. Editing the config does not take that back. Ramp it.

**Every stylesheet stopped loading the day `nosniff` went on.** The server sends `.css` as
`text/plain`, and until now the browser sniffed its way past that. Fix the type.

**Attribution went to zero after somebody set `Referrer-Policy: no-referrer`.** Nothing is sent to
anybody now, and the usual next move is `unsafe-url`, which hands over the full URL of every page.
The default, `strict-origin-when-cross-origin`, is the middle: cross-origin gets the origin and no
path or query.

**A routine dependency bump blanked the page, and the console reports a blocked resource.** The
`integrity` value still pins the previous file, and SRI cannot tell your new build from a tampered
one. Regenerate the hash in the commit that changes the version, and pin an exact version in the
URL: `chart-4/chart.js` resolves to different bytes the day the CDN publishes 4.4.1.

**A scan reports a missing `X-XSS-Protection` header, and adding it makes the site less safe.** MDN
marks it deprecated as of this page's verified date, and documents that it can create XSS
vulnerabilities in sites that had none. The value that is not a liability is `0`, and the control
the scan is groping for is a CSP without `'unsafe-inline'`.
