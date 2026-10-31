---
title: Proxies and identity
question: Which IP is actually the client once there is a proxy in front of me?
order: 5
practise:
  - security-trust-proxy-hops
  - rate-limit-express
  - security-rate-limit-auth
sources:
  - author: MDN
    title: X-Forwarded-For
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For
  - author: IETF
    title: 'RFC 7239: Forwarded HTTP Extension'
    url: https://www.rfc-editor.org/rfc/rfc7239.html
  - author: MDN
    title: Forwarded
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Forwarded
  - author: Express
    title: Express behind proxies
    url: https://expressjs.com/en/guide/behind-proxies/
  - author: Express
    title: 'Express 5.x API: Request'
    url: https://expressjs.com/en/5x/api/request/
verified: 2026-08-01
---

Once a load balancer or CDN sits in front of your app, every connection your app sees comes from
that box rather than from the person at the other end. The real address survives only if something
writes it into a header along the way, and any client can fill in that header with whatever it
likes. Rate limits, and anything else keyed on who the client is, depend on reading it the right way
round.

## The model

The socket tells you who connected to you, and that is all it tells you. Put a load balancer, a CDN
or an ingress controller in front of the app and the socket address is that box, identically, for
every request in the world. The client's address only survives if something in the chain wrote it
into a header, and a header is text that anybody can type.

`X-Forwarded-For` is the one you will meet. It is a comma-separated list where the leftmost entry is
meant to be the originating client and the rightmost is the proxy that most recently handled the
request. MDN is clear that it is non-standard. `Forwarded`, from RFC 7239, is the standardised
replacement and carries `for`, `by`, `proto` and `host` in one field, appended by each proxy in the
order the request travelled.

Neither is verified by anything. Each hop appends; nobody checks what was already there. A client
can open a connection to your edge with `X-Forwarded-For: 10.0.0.1` already set, and the edge will
dutifully append its own view after it. RFC 7239 says so in its security considerations: the field
"cannot be relied upon to be correct, as it may be modified, whether mistakenly or for malicious
reasons, by every node on the way to the server". MDN puts the operational rule next to it: trust
only the addresses added by proxies you control, and if your server is reachable directly from the
internet, no part of the list is trustworthy at all.

So read it from the right. The entries you can vouch for are the ones your own infrastructure
appended. Walk right to left past exactly as many hops as you actually operate, and the address you
stop at is the first one you did not write. Everything to the left of it is a claim.

## Worked example

Identifying the client in the rate-limit-express workout:

```js
app.set('trust proxy', 1); // exactly one proxy in front of this app

/** An API key if there is one, otherwise whoever the socket says they are. */
function clientOf(req) {
  const apiKey = req.get('x-api-key')?.trim();
  return apiKey || req.ip || 'unknown';
}

const key = `ratelimit:${clientOf(req)}`;
```

The number is the load-bearing part. Leave `trust proxy` at its default and `req.ip` is the proxy,
so everyone shares one bucket. Set it to `true` and `req.ip` becomes the leftmost `X-Forwarded-For`
entry, which is precisely the one an attacker writes. Set it to the number of hops you actually run
and Express counts in from the right, past your own proxies, and stops at the first address you did
not add.

Note what `clientOf` prefers. An API key is a value you issued, and an IP is a value you inferred,
so when both are present the one you issued wins.

## Traps

**One noisy client and everybody gets 429.** The limiter is counting your load balancer, because
`trust proxy` is off and every request arrives from the same address. The tell is that the access
log shows one IP for the entire internet. This is the failure mode where the limiter looks like it
works, right up to the first real burst.

**The limiter never fires at all.** The counter key is built straight from
`req.get('x-forwarded-for')`, so an attacker sends a different value on every request and gets a
fresh bucket each time. It is a one-line bypass with curl, and it is why "who is the client" is a
question the rate-limit workout makes you answer before the limiter counts as done. Anything
security-relevant keyed on an unverified header is not a control.

**`trust proxy: true` looks like the fix and moves the hole.** It tells Express to believe the whole
chain, and Express's own guide warns that the last trusted proxy then has to remove or overwrite
`X-Forwarded-For`, `X-Forwarded-Host` and `X-Forwarded-Proto`, or a client can provide any value it
likes. Trust a hop count you can name, or a specific list of addresses, and check that the edge
really does overwrite rather than append.

**Every redirect ends up on `http` and the browser gives up in a loop.** The proxy terminated TLS
and forwarded plain HTTP, so `req.protocol` reads `http`, the redirect-to-HTTPS middleware fires
again, and around it goes. With `trust proxy` enabled Express reads `X-Forwarded-Proto` instead,
which fixes the loop and is worth pausing over: the same header nobody verifies is now deciding
whether your application believes the connection was secure.
