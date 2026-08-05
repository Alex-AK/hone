---
title: no-store, no-cache and max-age=0
question: The page with personal data on it says no-cache and it is still on disk. Which one did I want?
order: 2
practise:
  - http-cache-immutable-asset
  - http-cache-control
  - http-etag-conditional
  - security-token-storage
  - conditional-requests-express
sources:
  - author: MDN
    title: HTTP caching
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching
  - author: MDN
    title: Cache-Control
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
  - author: IETF
    title: 'RFC 9111: HTTP Caching'
    url: https://www.rfc-editor.org/rfc/rfc9111.html
  - author: web.dev
    title: Prevent unnecessary network requests with the HTTP Cache
    url: https://web.dev/articles/http-cache
verified: 2026-08-01
---

## The model

Three directives, three different behaviours, and one of the names is a lie.

- `no-store` — the response is not written down. RFC 9111: "A cache MUST NOT store any part of
  either the immediate request or the response and MUST NOT use the response to satisfy any other
  request." Private and shared alike.
- `no-cache` — write it down, but never hand it back without asking first. MDN: the response "can be
  stored in caches, but the response must be validated with the origin server before each reuse,
  even when the cache is disconnected from the origin server." A copy on disk is the expected state.
- `max-age=0` — write it down and treat it as stale on arrival. Stale is not the same as forbidden,
  which is why the old spelling of `no-cache` was `max-age=0, must-revalidate`.

Only the first keeps bytes off the disk, and it is the one nobody reaches for.

MDN is blunt about the third: that pairing "is a remnant of the fact that many implementations prior
to HTTP/1.1 were unable to handle the `no-cache` directive", and "now that HTTP/1.1-conformant
servers are widely deployed, there's no reason to ever use that `max-age=0` and `must-revalidate`
combination". Write `no-cache`.

The same three tokens exist as request directives, which is where reloads come in. What the browser
sends is the whole difference between the three ways of asking for a page:

|             | What the browser sends                                                   | What comes back                   |
| ----------- | ------------------------------------------------------------------------ | --------------------------------- |
| Fresh visit | nothing at all, if the stored copy is still fresh                        | the stored copy, no network       |
| Reload      | `Cache-Control: max-age=0`, plus `If-None-Match` and `If-Modified-Since` | 304 if unchanged, 200 if not      |
| Hard reload | `Cache-Control: no-cache` and `Pragma: no-cache`, no conditions          | 200 from the origin, body and all |

MDN documents those exact request headers for Chrome, Edge and Firefox, and notes Safari differs a
little. The middle row is the one worth reading twice: a reload is a conditional request, so a 304
is a successful reload that transferred nothing.

## Worked example

The bug from `http-cache-control`, which is one word:

```http
# What it said. The response is stored; it is only revalidated before reuse.
Cache-Control: no-cache

# What it meant.
Cache-Control: no-store
```

And the three lines that cover most of an application:

```http
# A hashed asset. The name changes when the bytes change, so it can never be wrong.
GET /assets/app.4f2c9d.js
Cache-Control: public, max-age=31536000, immutable

# The HTML that names it. Cheap to check, and must never be a version behind.
GET /
Cache-Control: no-cache

# The bank statement.
GET /account/statement
Cache-Control: no-store
```

web.dev gives the first two as the recommendation directly: `max-age=31536000` for URLs carrying
version or fingerprint information, and `no-cache` with a validator for unversioned URLs like HTML.

## Traps

**You set `no-store` and the old value keeps coming back.** `no-store` stops a response being
written. It does nothing about what is already written. MDN says so plainly: "if there is an old
response already stored for a particular URL, returning `no-store` will not prevent the old response
from being reused." Changing the header fixes the future and not the present. A new URL does, and so
does a revalidation the old copy has to pass.

**`no-cache` on the account page, and the account page is still on the laptop.** `no-cache` is a
freshness control, not a privacy one, and adding `private` narrows storage to the browser rather
than preventing it. If the requirement is that these bytes must not survive on this machine, the
directive is `no-store`. The same reasoning is why a session token in `localStorage` is a decision
and not a default, which is `security-token-storage`.

**`no-store` on everything, because caching is frightening.** Now the hashed bundle is downloaded on
every navigation and the 304 that would have cost nothing never happens. MDN's advice is the
opposite default: "prefer the use of `no-cache` in combination with `private`", which keeps the copy
and checks it, rather than throwing it away and refetching.

**"It works when I hard reload."** That is you sending `Cache-Control: no-cache` for one navigation,
in one browser. It is a good diagnostic, because it tells you the stale copy was above the network
line, and it is not a fix, because nobody else is going to do it.
