---
title: Request/response over HTTP
question: Why is a plain request still the right answer more often than it feels like it should be?
order: 2
practise:
  - http-fetch-not-ok
  - http-timeout-fetch
  - http-retry-safe-methods
  - http-idempotency-key
  - js-abort
  - js-promise-timeout
sources:
  - author: IETF
    title: 'RFC 9110: HTTP Semantics'
    url: https://www.rfc-editor.org/rfc/rfc9110.html
  - author: MDN
    title: 'Window: fetch() method'
    url: https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch
  - author: MDN
    title: AbortSignal
    url: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
verified: 2026-08-01
---

The simplest way to move data is to ask for it and get an answer, with nothing remembered on either
side once the exchange is over. Because each request stands on its own, every load balancer, cache
and proxy on the web can help without knowing what came before. Most of the bugs live in the client,
which has to notice when the answer is bad news or never comes at all.

## The model

One client asks, one server answers, and then neither owes the other anything. That is the whole
protocol, and every convenience built on top of HTTP falls out of it.

RFC 9110 puts it plainly: HTTP is stateless, so each request can be understood on its own. Nothing
in the request depends on the one before it, which means anything in the middle is free to make
decisions without knowing the history. A load balancer can send this request to a different
instance than the last one. A cache can answer it without asking anyone. A proxy can retry it. A
crash between two requests costs nothing, because there was nothing being held.

That is the trade. You give up the server's ability to speak first, and you get every piece of
infrastructure ever built for the web working for you by default.

The corollary is worth stating: statelessness is a property of the protocol, not of your
application. Sessions, cookies and tokens all exist to smuggle state back in, and each one is
something you have to carry on every request, precisely because the protocol will not remember it
for you.

## Worked example

The version people write, and the version that survives contact with a real network:

```js
// What most code does.
const data = await fetch(url).then((r) => r.json());
```

```js
// What it has to do.
const response = await fetch(url, {
  signal: AbortSignal.timeout(5000),
});

if (!response.ok) {
  throw new Error(`Request failed: ${response.status}`);
}

const data = await response.json();
```

Two things are being fixed. `fetch` rejects only when the round trip could not complete at all: DNS
failure, connection refused, a CORS rejection, an abort. A 500 is a perfectly successful round trip
in which the server told you it had a problem, so the promise resolves and the first version parses
an HTML error page as JSON. And `fetch` has no timeout of its own, so an unresponsive server leaves
that promise pending until the browser gives up, which can be minutes of spinner.

## Traps

**The catch block that never runs.** The symptom is an error page rendering as if it were data, or
a confusing `SyntaxError` about an unexpected `<`. `fetch` resolved because the request worked; the
server's answer was just bad news. Branch on `response.ok`, which is true for 200 to 299.

**The spinner that never stops.** No timeout was set, because `fetch` does not have one.
`AbortSignal.timeout(ms)` gives you a signal that aborts itself and rejects with a `TimeoutError`
you can tell apart from a user-initiated cancel. Racing a `setTimeout` against the promise looks
equivalent and is not: the request stays open and keeps running, you just stopped listening.

**Retrying whatever failed.** A GET can be retried freely. A POST that timed out may have been
processed, and you cannot tell from here: the answer was lost, not the request. Retrying it charges
the card twice. That is what idempotency keys are for, and why the safe methods are worth knowing
by name rather than by feel.

**Chatty by default.** The place request/response genuinely loses is a screen that needs eleven
things before it can render. That is a real cost and it has real answers (one endpoint shaped for
the screen, or a protocol that batches), but reach for those when you have measured eleven round
trips, not because a stream sounds faster.
