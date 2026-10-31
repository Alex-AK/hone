---
title: Secrets, and what a bundle publishes
question: The key is in an environment variable, so how did someone read it out of the app?
order: 6
practise:
  - security-secrets-in-frontend
sources:
  - author: Vite
    title: Env Variables and Modes
    url: https://vite.dev/guide/env-and-mode
  - author: Vite
    title: Build Options
    url: https://vite.dev/config/build-options
  - author: Next.js
    title: How to use environment variables in Next.js
    url: https://nextjs.org/docs/app/guides/environment-variables
  - author: Stripe
    title: API keys
    url: https://docs.stripe.com/keys
  - author: Google
    title: Google Maps Platform security guidance
    url: https://developers.google.com/maps/api-security-best-practices
  - author: Firebase
    title: Understand Firebase projects
    url: https://firebase.google.com/docs/projects/learn-more
  - author: Sentry
    title: Data Source Name (DSN)
    url: https://docs.sentry.io/concepts/key-terms/dsn-explainer/
  - author: OWASP
    title: Secrets Management Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
verified: 2026-08-02
---

Apps need keys to talk to other services, and the usual advice is to keep them in environment
variables rather than in the code. That protects a key on a server. In a front-end app the build
copies the value into the JavaScript every visitor downloads, where anyone can read it.

## The model

**Anything the browser needs, the user has.** No arrangement of code makes a value present in a page
and unreadable from it, because the code that reads the value runs on hardware the user controls, in
a debugger they can open.

An environment variable feels like an exception because of where it starts. It does not stay there:
a build-time variable becomes a string literal in the JavaScript you ship. Vite says the values
under `import.meta.env` "are defined as global variables during dev and statically replaced at build
time to make tree-shaking effective." Next.js describes the same step, replacing every
`process.env.[variable]` reference in the client bundle with a hard-coded value.

### The prefix is a signal, not a fence

`VITE_` and `NEXT_PUBLIC_` decide which variables cross into the bundle. They do nothing to the
value once it is there, and Vite's docs say plainly that `VITE_` variables should not hold sensitive
information such as API keys.

In Next.js, unprefixed variables stay on the server and `NEXT_PUBLIC_` ones are substituted into the
client bundle by `next build`, after which the app no longer responds to changes in them. One image
promoted through staging and production carries staging's value into both. The substitution is
textual, too: Next.js does not inline a dynamic lookup such as `process.env[varName]`. Write the
full static reference or you get `undefined` in the browser and no error anywhere.

### Minification is not obfuscation

Minification renames bindings and deletes whitespace. A string literal is not a binding, so it
travels through unchanged and a search in the network tab finds it on the first try. A source map
goes further and hands over the original code, comments and all. Vite's `build.sourcemap` defaults
to `false`, and `'hidden'` writes the maps without the comments in the bundle that point to them,
which is the setting for uploading maps to an error tracker without serving them from the CDN.

### The fix is a seam

Call the third party from your own server, and keep the key in that process's environment, where it
is read at runtime and never serialised into a response. That is Vite's own advice for production.
The seam earns its place even where the key is not sensitive: it is somewhere to rate-limit, so one
tab in a retry loop cannot spend your quota, and somewhere to log who called and how often.

### What is genuinely publishable

Plenty of keys belong in the browser. The test has two parts: the vendor documents the key as
public, and its capabilities are scoped so that holding it is not the same as being you.

- **A Stripe publishable key.** Stripe says it is safe to embed, and that only publishable keys are.
  Every other Stripe key, restricted keys included, is yours to protect.
- **A Firebase web config.** Firebase treats the config, API key included, as public, and puts the
  enforcing in Firebase Security Rules.
- **A Sentry DSN.** Sentry calls DSNs safe to keep public because they only allow submitting new
  events, with no read access to anything.
- **A Google Maps key, once you have restricted it.** Google pairs a Websites restriction, with the
  full referrer string including the scheme, with an API restriction so the key reaches only the
  APIs you named.

In each, something other than secrecy does the enforcing. A key that is public because nobody
thought about it has none of that.

### Rotation, because a leak is permanent

A key that reached a browser cannot be recovered, and rewriting the commit does not help: the old
object stays in anyone's clone, in your CI caches, and in whatever proxy fetched the tarball. OWASP
puts immediate revocation first, then a replacement you can issue quickly. Rotating on a schedule is
the same tool used ahead of time, so a stolen credential works only for a short time. At runtime a
secret belongs in the server process's environment or a secret manager, injected at deploy time
rather than build time, and [configuration and secrets](../production/config-and-secrets.md) covers
holding and rotating it there.

## Worked example

Here is the source:

```js
const key = import.meta.env.VITE_API_KEY;

export async function quote(symbol) {
  const res = await fetch(`https://api.vendor.com/quote?symbol=${symbol}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return res.json();
}
```

And here is what a bundler emits for it, minified, with the key defined at build time:

```text
var t="sk_live_51H8xQ2eZvKYlo2C";async function r(e){return(await fetch(`https://api.vendor.com/quote?symbol=${e}`,{headers:{Authorization:`Bearer ${t}`}})).json()}export{r as quote};
```

`key` became `t` and `symbol` became `e`. The one thing worth hiding came through untouched, because
renaming a binding is all minification is doing.

The same feature with the key on the server:

```js
// client. No key, and no vendor URL either.
const res = await fetch(`/api/quotes?symbol=${encodeURIComponent(symbol)}`);
```

```js
// server. process.env is read per request and never reaches a response body.
app.get('/api/quotes', rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const upstream = await fetch(
    `https://api.vendor.com/quote?symbol=${encodeURIComponent(req.query.symbol)}`,
    { headers: { Authorization: `Bearer ${process.env.VENDOR_API_KEY}` } }
  );

  if (!upstream.ok) {
    // The vendor's error body can name the account or the key. Send your own.
    res.status(502).json({ error: 'quote unavailable' });
    return;
  }

  res.json(await upstream.json());
});
```

## Traps

**`.env` is in `.gitignore` and the key turned up in a scraper's dataset anyway.** Ignoring the file
kept it out of the repository, which is a different problem from keeping it out of the build. The
prefix on the variable told the bundler to inline it. Search your own `dist` for the value before
you believe a key is server-side: if `grep` finds it there, so will everyone else.

**The value is `undefined` in production and correct in `pnpm dev`.** The reference was computed
rather than written out, and Next.js does not inline dynamic lookups. `process.env[name]` and a
destructured `const { NEXT_PUBLIC_X } = process.env` both fail this way, silently, because there is
nothing left to read at runtime in the browser.

**The environment variable changed, the container restarted, and the old value is still on screen.**
Build-time inlining made the value part of the artifact, so one image cannot serve two environments
with different public config. Build per environment, or fetch the config from an endpoint at
startup.

**The bundle is minified and a search for `sk_live_` finds the key in one hit.** Minification
renames local bindings; a string literal has no name to rename. If a source map is published beside
the bundle it is worse than a hit, because the map reconstructs the original file. Ship maps to your
error tracker with `build.sourcemap: 'hidden'`, not to the CDN.

**The key was rotated, the commit was rewritten, and the old key kept working.** Removing a secret
from history is cleanup, not revocation, and the two are unrelated: anyone who cloned before the
rewrite still has the object. Revoke at the vendor first, reissue second, and treat the history
rewrite as optional tidying afterwards.

**The Maps key is documented as public and the invoice is the surprise.** A key in a page is a key
anyone can lift into their own site, and an unrestricted one bills you for their traffic: "You are
financially responsible for charges caused by abuse of unrestricted API keys." Set the referrer
restriction and the API restriction, then publish it.
