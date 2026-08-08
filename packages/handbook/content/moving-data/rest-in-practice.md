---
title: REST in practice
question: Which REST conventions are worth defending in review, and which argument should I let go of?
order: 4
practise:
  - http-put-vs-patch
  - http-merge-patch-null
  - http-status-created
  - http-status-choice-validation
  - http-401-vs-403
sources:
  - author: IETF
    title: 'RFC 9110: HTTP Semantics'
    url: https://www.rfc-editor.org/rfc/rfc9110.html
  - author: MDN
    title: 'REST (glossary)'
    url: https://developer.mozilla.org/en-US/docs/Glossary/REST
  - author: MDN
    title: HTTP response status codes
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status
  - author: MDN
    title: PATCH request method
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods/PATCH
  - author: MDN
    title: Link header
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Link
verified: 2026-08-01
---

## The model

REST is a set of architectural constraints. What ships under the name is an HTTP API with
resource-shaped URLs, and MDN says as much: HTTP APIs "are sometimes colloquially referred to as
RESTful APIs, RESTful services, or REST services, although they don't necessarily adhere to all REST
constraints". That gap is where the arguments come from, so it is worth separating the conventions
that buy you something from the ones that only buy you the word.

What buys you something is that HTTP already has semantics, and RFC 9110 defines them, so every
client, proxy and cache in the path knows what your endpoint means before anyone reads your docs.
Three properties do the work.

**Safe.** A method is safe if "their defined semantics are essentially read-only". GET, HEAD,
OPTIONS and TRACE are safe. RFC 9110 is explicit about why the distinction exists: "to allow
automated retrieval processes (spiders) and cache performance optimization (pre-fetching) to work
without fear of causing harm". Something out there will fetch every URL it can see, and it is
relying on you having meant it.

**Idempotent.** "The intended effect on the server of multiple identical requests with that method
is the same as the effect for a single such request." PUT, DELETE and the safe methods are
idempotent. POST is not. PATCH is not a method RFC 9110 defines at all, and MDN's summary table lists
it as neither safe nor idempotent. This property is what makes an automatic retry legal: a client
whose connection dropped before it read the response can repeat a PUT and know where it lands.

**Cacheable.** A GET response can be stored and reused by anything between you and the origin. This
is the largest thing you get for free, and it is keyed on the URL, which is the actual reason
resource-shaped URLs earn their keep.

Status codes are the fourth piece, and the cheapest documentation you will ever write, because every
HTTP client already speaks them.

## Worked example

One resource, and the conventions that pay for themselves:

```http
GET    /orders?status=pending&limit=20   200   safe, cacheable, retryable by anything
POST   /orders                           201   Location: /orders/1042
GET    /orders/1042                      200   ETag: "v3"
PUT    /orders/1042                      200   full replacement, so repeating it is harmless
PATCH  /orders/1042                      200   partial change, repeating it may not be
DELETE /orders/1042                      204   success, deliberately no body
POST   /orders  (email already taken)    409   the request is fine, the world is not
```

Each line is doing a job a client can use without asking you. `201` plus `Location` means a caller
can follow up on the thing it just made without parsing the body, and RFC 9110 says an origin server
"SHOULD send a 201 (Created) response containing a Location header field" when a POST creates
something. The `ETag` on the GET is what turns the next fetch into a conditional request. And the
`409` separates "your request is malformed" (`400`) from "your request is fine, but it conflicts
with the current state", which is a distinction clients branch on.

Now the argument that does not pay. Whether cancelling an order is `POST /orders/1042/cancel` or
`PATCH /orders/1042` with `{"status": "cancelled"}` will not change a single thing about how the API
behaves. Both are unsafe, both are non-idempotent, both need the same status code on conflict. Pick
one, write it in a style guide, and spend the standup on whether the operation is retry-safe, which
is a question with a wrong answer.

## Traps

**Rows disappearing with no user in the logs.** Something crawled or prefetched a link. RFC 9110
names this failure directly, using `page?do=delete` as the example, and puts the responsibility on
the resource owner: if a resource performs an unsafe action, it "MUST disable or disallow that
action when it is accessed using a safe request method". A GET that changes state is not a style
violation, it is a live bug waiting for a link checker.

**The retry charged the card twice.** A POST timed out, so something retried it, and the original
had already been processed. Nothing in the chain can fix this for you: RFC 9110 says a client
"SHOULD NOT automatically retry a request with a non-idempotent method unless it has some means to
know that the request semantics are actually idempotent". PATCH surprises people here too. "Set
status to cancelled" is idempotent; "add 1 to the retry count" applied twice lands somewhere else.

**A logged-in user bouncing around the login page in a loop.** The server returned `401` for a
permission failure and the client did what `401` means, which is authenticate and try again. `401`
is "I do not know who you are". `403` is "I know exactly who you are and I am refusing anyway", and
re-authenticating cannot help. Getting these the wrong way round produces a redirect loop that looks
like a client bug and is not.

**A standup spent on HATEOAS.** The argument is that responses should carry the links describing
what the client can do next, so URLs are discovered at runtime rather than hard-coded, and an API
without them is not really REST. Nothing in HTTP requires it, and the clients you actually ship,
whether a generated SDK or a `fetch` call in a component, resolve their paths at build time and
never read the links. The hypermedia that does earn its keep is narrow and already standardised:
`Location` on a 201, and a `Link` header with `rel="next"` for pagination, which lets a client walk
pages without knowing how your cursors are encoded. Ship those two and let the rest go.
