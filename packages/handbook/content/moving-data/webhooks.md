---
title: Webhooks
question: Somebody else's server is going to POST to me whenever it likes. What has to be true of my endpoint before I ship it?
order: 12
practise:
  - http-webhook-raw-body
  - http-idempotency-key
  - sys-idempotency
  - http-retry-safe-methods
  - jwt-auth-express
sources:
  - author: Stripe
    title: Receive Stripe events in your webhook endpoint
    url: https://docs.stripe.com/webhooks
  - author: GitHub
    title: Validating webhook deliveries
    url: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
  - author: GitHub
    title: Best practices for using webhooks
    url: https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks
  - author: IETF
    title: 'RFC 9110: HTTP Semantics'
    url: https://www.rfc-editor.org/rfc/rfc9110.html
verified: 2026-08-01
---

Instead of you asking another service what happened, it tells you: you hand it a URL, and its server
sends a request to yours whenever something changes on its side. Anyone on the internet can reach
that URL, the same event can arrive more than once or out of order, and the sender does not wait
long for an answer. An endpoint that does not plan for all of that ends up trusting forged requests
or doing the same work twice.

## The model

A webhook is an ordinary POST that you did not ask for. You publish a URL, the other side stores it,
and when something happens on their system their server makes a request to yours. The roles are
swapped: you are the server, and the client is somebody whose behaviour you do not control.

**Who starts it.** Their server, on their schedule. You cannot request an event, you can only be
told about one. If you were down when it fired, your only recovery is whatever replay they offer.

**How many messages.** One HTTP exchange per event, inbound, and the same event can arrive more than
once. Stripe says so plainly: endpoints can receive the same event repeatedly, and the remedy is to
log the event IDs you have processed and skip the ones you have seen.

**Delivery.** Their retry policy, not yours, and it is generous. Stripe attempts delivery for up to
three days with exponential backoff in live mode. Order is not promised either, so `invoice.paid`
can land before the `customer.subscription.created` that explains it. RFC 9110 counts PUT, DELETE
and the safe methods as idempotent, and POST is not on that list, so a redelivered POST is safe only
because you made it safe.

**Cost.** A publicly reachable endpoint that has to stay up and answer fast. GitHub asks for a 2xx
within 10 seconds. Anything else is a failure, a failure means a retry, and a retry means the work
you already did happens a second time.

Then there is authenticity, which is not one of the four questions because it is not a choice. The
request arrives from the open internet, so anyone who learns the URL can post to it. Stripe and
GitHub solve this the same way: an HMAC over the raw request body, keyed with a shared secret, sent
in a header. GitHub uses `X-Hub-Signature-256`, an HMAC hex digest prefixed with `sha256=`. Stripe
uses `Stripe-Signature`, which carries a timestamp as `t=` and an HMAC-SHA256 signature as `v1=`,
computed over the timestamp, a full stop, and the body. That timestamp is deliberate: it is what
stops a captured request being replayed forever, and Stripe's libraries default to a five-minute
tolerance between it and the current time.

## Worked example

Verify, dedupe, answer, and only then do the work:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

// express.raw, not express.json: the signature covers the exact bytes they sent.
app.post('/webhooks/github', express.raw({ type: 'application/json' }), (req, res) => {
  const expected = `sha256=${createHmac('sha256', SECRET).update(req.body).digest('hex')}`;
  const sent = req.get('X-Hub-Signature-256') ?? '';

  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  const signed =
    sent.length === expected.length && timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!signed) return res.sendStatus(401);

  // The same delivery id means this exact request has been here before.
  const id = req.get('X-GitHub-Delivery');
  const claim = db.prepare('INSERT OR IGNORE INTO deliveries (id) VALUES (?)').run(id);
  if (claim.changes === 0) return res.sendStatus(200);

  jobs.add('github-event', JSON.parse(req.body));
  res.sendStatus(200);
});
```

The handler does no work of its own. It checks the signature, records the delivery, queues a job and
returns, so a slow database or a downstream outage cannot turn into a redelivery. GitHub recommends
this shape for the same reason: everything past the 2xx belongs somewhere the sender is not waiting.

Two details carry weight. `timingSafeEqual` compares in constant time, which is what GitHub asks for
so that a `===` cannot leak the correct signature one byte at a time. And the delivery id goes in
with `INSERT OR IGNORE`, so the second copy of a request is recognised by the database rather than
by a check-then-write that two concurrent deliveries can both pass.

## Traps

**The signature never matches and the payload looks perfect.** A body parser ran first.
`express.json()` turns the bytes into an object, and re-serialising that object produces different
bytes: another key order, other whitespace, a different escape. The HMAC covers what was sent, so
the raw body is the only thing you can hash. Mount `express.raw` on the webhook route and leave the
JSON parser everywhere else.

**The customer got three shipping confirmations.** Your handler did the work and then returned 200,
and the work took longer than the sender's timeout. They recorded a failure, retried, and you did it
all again. Ten seconds is less time than it sounds like once a downstream call is slow. Answer
first, work afterwards, and key that work on the delivery id so a real duplicate is a no-op. The
sender's retry policy is not yours to change, which makes this the one thing on the page you cannot
skip.

**An old event undoes a newer one.** A subscription is cancelled and reinstated, and the two events
land in that order. Nothing is broken, because order was never promised. Do not build a state
machine that assumes it: either treat an event as a nudge to go and read the current state from
their API, or stamp your records with the event's own timestamp and ignore anything older than what
you already applied.

**A valid signature on a request from an hour ago.** A signature proves the body came from whoever
holds the secret. On its own it says nothing about when. Anyone who captured a single delivery can
send it back for as long as that secret lives, and every replay is authentic. Stripe signs the
timestamp along with the body and rejects anything outside the tolerance window for this reason. If
your provider gives you a delivery id instead, the table you store it in is a security control, not
housekeeping.
