---
title: Authentication versus authorization
question: Who you are versus what you may do, and where does each check belong?
order: 5
practise:
  - jwt-auth-express
  - auth-guard-nestjs
  - http-401-vs-403
  - security-token-storage
  - security-unguessable-id-not-authorization
sources:
  - author: IETF
    title: 'RFC 9110: HTTP Semantics'
    url: https://www.rfc-editor.org/rfc/rfc9110.html
  - author: IETF
    title: 'RFC 7519: JSON Web Token (JWT)'
    url: https://www.rfc-editor.org/rfc/rfc7519.html
  - author: IETF
    title: 'RFC 8725: JSON Web Token Best Current Practices'
    url: https://www.rfc-editor.org/rfc/rfc8725.html
  - author: MDN
    title: Set-Cookie
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
verified: 2026-08-01
---

## The model

Two questions with two answers and two status codes. Authentication asks who this is.
Authorization asks whether this one may do that. `401` is "I do not know who you are", and RFC 9110
requires it to carry a `WWW-Authenticate` header saying how to fix that. `403` is "I know exactly
who you are and the answer is still no", which is why sending the same credentials again is
pointless.

Sessions and tokens are two answers to the first question, and they differ in where the truth is
kept.

A **session** keeps it on the server. The cookie carries an opaque id and the server looks up what
it means, so revoking access is a delete. The cost is that every request needs that lookup against
a store every instance can reach.

A **token** carries it. A JWT (RFC 7519) is a set of claims as JSON, base64url-encoded, with a
signature over them, and the registered claims are the ones worth knowing by name: `iss`, `sub`,
`aud`, `exp`, `nbf`, `iat`, `jti`. The server verifies the signature and reads the claims, so no
lookup and no shared state. The cost is the exact mirror of the benefit: you cannot un-issue one. A
token is good until `exp`, so "log out everywhere" means either a revocation list, which is the
lookup you were avoiding, or short expiries plus a refresh token, which puts a revocable session
back on the server and uses the JWT only for the fifteen minutes in between.

Signed is not secret. A JWS payload is encoded, not encrypted, and anyone holding the token can read
every claim in it. Put nothing in there you would not print.

How the credential is stored is a separate axis from what it is. Either can travel in a cookie or in
`Authorization`. `HttpOnly` forbids JavaScript from reading a cookie, which closes the path where
one XSS walks off with the token, and MDN is precise about what it does not do: an `HttpOnly` cookie
is still attached to requests that JavaScript makes. Being attached automatically is what makes CSRF
possible, which is what `SameSite` is for, and `SameSite=None` requires `Secure`.

Authorization is the half people build twice. Authentication resolves the caller once, at the edge,
in middleware or a guard that runs before any handler. Authorization depends on the resource, so
"is this report yours" cannot be answered without loading the report, and the obvious place to
answer it is inside the handler that already did. That version decays. Four handlers with four
copies of the same `if` can all be correct today and still leave the fifth uncovered, because a
copied check protects only the routes that existed when it was copied. Declared once, on the
controller, it also covers the route nobody has written yet.

Two details the placement changes. The check has to run before the work does: a `403` returned after
the row was deleted is not a `403`. And the anonymous case is answered before anything is looked up,
because if a stranger gets `404` for one id and `403` for another, the difference is a list of which
ids exist.

## Worked example

Issuing a token, where the expiry is not optional:

```js
const token = await new SignJWT({ role: user.role })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(String(user.id))
  .setExpirationTime('15m')
  .sign(SECRET_KEY);
```

Verifying it, where every failure is the same answer:

```js
async function requireAuth(req, res, next) {
  const [scheme, token] = (req.get('Authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Not decode. Verify, with the algorithms pinned.
    const { payload } = await jwtVerify(token, SECRET_KEY, { algorithms: ['HS256'] });
    const user = await findUserById(Number(payload.sub));
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  } catch {
    // Verification rejects rather than throwing. Uncaught, a junk token is a 500.
    res.status(401).json({ error: 'Unauthorized' });
  }
}
```

Authorization, declared where new routes inherit it:

```ts
@UseGuards(OwnerGuard) // on the controller, so route five is covered too
@Controller('reports')
export class ReportsController {
  @Get() list(@Req() req) { ... }
  @Get(':id') read(@Param('id') id: string) { ... }
  @Get(':id/export') export(@Param('id') id: string) { ... }
  @Delete(':id') remove(@Param('id') id: string) { ... }
}
```

## Traps

**A malformed token returns `500`.** Verification failed, and the failure was a rejected promise
nobody caught, so a garbage `Authorization` header became a server error. Every reason to refuse
looks the same from outside: missing header, wrong scheme, bad signature, expired, unknown subject.
All of them are `401`, and none of them say which.

**The token was decoded rather than verified.** Decoding reads the claims of any token at all,
including one an attacker minted, and it succeeds. RFC 8725 is explicit about the surrounding
discipline: the caller specifies which algorithms are acceptable, the library uses no others, and
the whole token is rejected if any cryptographic check fails. Pin the algorithm rather than trusting
the `alg` header, and validate `iss` and `aud` if anything else in your estate signs tokens.

**Logged out, and the token still works for nine more minutes.** Nothing revokes a JWT, and this is
the property that was traded for the missing lookup. It is a fine trade at fifteen minutes and a bad
one at thirty days, which is the actual argument for short access tokens and a refresh token that
lives somewhere you can delete.

**A logged-in user is bounced to the login screen in a loop.** The client treats every failure as
"log in again", so a `403` sends an authenticated user to a login page that authenticates them
successfully and returns them to the same `403`. `401` means retry with credentials. `403` means
stop and show them why.

**The new export route hands out everybody's reports.** The ownership check was written into the one
handler that needed it, and the three routes added since do the same query without it. The fix is
not a fourth copy. It is a guard on the controller, so the check is a property of the resource
rather than a thing each author has to remember.
