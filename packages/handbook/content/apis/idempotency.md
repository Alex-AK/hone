---
title: Idempotency
question: The payment timed out and I cannot tell whether it went through. Is retrying safe?
order: 2
practise:
  - http-idempotency-key-scope
  - idempotent-payments-express
  - http-idempotency-key
  - http-retry-safe-methods
  - http-put-vs-patch
  - forms-optimistic-double-submit
sources:
  - author: IETF
    title: 'RFC 9110: HTTP Semantics'
    url: https://www.rfc-editor.org/rfc/rfc9110.html
  - author: MDN
    title: 'Glossary: Idempotent'
    url: https://developer.mozilla.org/en-US/docs/Glossary/Idempotent
  - author: Stripe
    title: Idempotent requests
    url: https://docs.stripe.com/api/idempotent_requests
  - author: Brandur Leach
    title: Designing robust and predictable APIs with idempotency
    url: https://stripe.com/blog/idempotency
  - author: IETF httpapi Working Group
    title: The Idempotency-Key HTTP Header Field
    url: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
verified: 2026-08-01
---

Networks lose replies, so a client that hears nothing back cannot tell whether its request was
never done or was done and the answer went missing. Sending it again is harmless for some requests
and costly for others, such as a payment that charges the card twice. Idempotency is the property
that makes a repeat safe, and where a request lacks it, you can build it in.

## The model

Idempotent means the effect of N identical requests is the effect of one. That is the whole
definition, and two things people attach to it are not part of it.

It says nothing about the responses matching. MDN's example is the clearest one: the first `DELETE`
returns `200`, the second returns `404`, and `DELETE` is still idempotent, because the state of the
server after two is the state after one. A replayed request is allowed to answer differently.

It is also not the same word as safe. Safe means read-only: RFC 9110 calls a method safe if its
defined semantics are essentially read-only, and lists GET, HEAD, OPTIONS and TRACE. Idempotent is
the weaker property, and RFC 9110 gives it to PUT, DELETE and the safe methods. So `DELETE` is
idempotent and not safe, `POST` is neither, and `PATCH` is neither by definition even though a
particular patch may be: setting a field to a value is idempotent, incrementing it is not.

The reason this matters is retries. A client that times out has learned that the response was lost,
not that the work was skipped. If the method is idempotent, sending it again costs nothing. If it is
`POST /payments`, sending it again charges the card twice.

An idempotency key moves the guarantee off the method and into the request. The client generates one
key per logical operation, sends it with every attempt of that operation, and the server keeps a
record of what it did with that key. Three steps, and the order is the whole design:

1. **Check.** Look the key up. Seen and finished, replay the stored response and stop.
2. **Store.** Claim the key before doing the work, so a second request arriving now can find it.
3. **Replay.** When the work finishes, record the status and body against the key, and answer.

Stripe's version is the one everyone copies: an `Idempotency-Key` request header, the resulting
status code and body of the first request saved "regardless of whether it succeeds or fails", the
same result returned for subsequent requests, and keys removable once they are at least 24 hours
old. The IETF httpapi working group has a draft specifying the header field, which reached revision
07 in October 2025 and has since expired, so it is a description of established practice rather than
a standard to point a client at.

The hard part is step 2, and it is hard because "have I seen this key" is a question, not a
decision. Two identical requests can be in flight at the same instant: a double-clicked button, a
proxy that retried, a job runner that ran twice. Both check, both find nothing, both charge. The
lookup has to be something the database arbitrates, so the store is the claim: a unique index on the
key and an insert that either wins or conflicts. A request that loses the race has found an
operation in progress, which is a `409`, both in Stripe's status code reference and in the draft.

## Worked example

Check, store and replay in one handler. The `INSERT` is the interesting line, because it does the
checking:

```js
app.post('/payments', async (req, res) => {
  const key = req.get('Idempotency-Key');
  if (!key) return res.status(400).json({ error: 'Idempotency-Key required' });

  const fingerprint = hash(req.body);

  // Claim it. A unique index on `key` makes this the decision, not a lookup.
  const claimed = await db.insertIgnore('idempotency_keys', {
    key,
    fingerprint,
    state: 'in_progress',
  });

  if (!claimed) {
    const seen = await db.findOne('idempotency_keys', { key });
    if (seen.fingerprint !== fingerprint) {
      return res.status(422).json({ error: 'Key reused with different parameters' });
    }
    if (seen.state === 'in_progress') {
      return res.status(409).json({ error: 'A request with this key is in progress' });
    }
    return res.status(seen.status).json(seen.response); // the replay
  }

  const charge = await gateway.charge(req.body);
  await db.update('idempotency_keys', { key }, { state: 'done', status: 201, response: charge });
  res.status(201).json(charge);
});
```

The client's half is one line, and the line it is on matters:

```js
const key = crypto.randomUUID(); // once, when the user pressed the button

for (let attempt = 0; attempt < 3; attempt += 1) {
  const res = await fetch('/payments', {
    method: 'POST',
    headers: { 'Idempotency-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(payment),
  });
  if (res.status !== 409) return res;
  await sleep(backoff(attempt));
}
```

## Traps

**Two charges, and the idempotency table has one row.** Both requests arrived within a few
milliseconds of each other. The check ran twice, missed twice, and the insert happened after the
money moved, so the table only ever learned about the winner. A `SELECT` followed by an `INSERT` is
not a lock. Claim the key first, let a unique index settle the race, and answer the loser with
`409`.

**Retrying returns the same `500` forever.** This is working as designed and still surprises people.
Stripe records the outcome of the first attempt whatever it was, so a stored failure replays exactly
like a stored success. If you want the operation attempted again rather than its result read back,
that is a new key, which means the client has to know the difference between "this failed and can be
retried" and "this failed".

**Same key, different amount, and the customer paid the old one.** The second call reused a key with
a changed body, and a server that only compares keys happily replays the first payment's `201`. The
second payment never happens and nothing errors. Fingerprint the request alongside the key and
refuse a mismatch with `422`, which is what Stripe does and what the draft specifies.

**The key is generated inside the retry loop.** One key per attempt is no key at all, and this is
the single most common way the mechanism is fitted and does nothing. The key belongs to the logical
operation: minted when the form is rendered or the button is pressed, and reused unchanged by every
attempt. The same reasoning kills the client-side fix on its own, because disabling the submit
button does not survive a refresh, a second tab or a network-level retry.

**A unique constraint would have done.** Not every write needs a key. If the operation already has a
natural identity, one enrolment per student per course, one invoice per order, a unique index says
so once and every duplicate path fails at the database. Reach for idempotency keys when the
operation genuinely has no natural key, which is usually because it talks to something outside your
database.
