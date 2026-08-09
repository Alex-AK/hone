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

## The model

Anything the browser needs, the user has. There is no arrangement of code in which a value is
present in a page and unreadable from it, because the code that reads the value runs on hardware the
user controls, in a debugger they can open.

An environment variable feels like an exception because of where it starts. It does not stay there.
A build-time variable stops being a variable during the build and becomes a string literal in the
JavaScript you ship. Vite says so directly: the values under `import.meta.env` "are defined as
global variables during dev and statically replaced at build time to make tree-shaking effective."
Next.js describes the same step: it will "inline a value, at build time, into the js bundle that is
delivered to the client, replacing all references to `process.env.[variable]` with a hard-coded
value."

### The prefix is a signal, not a fence

`VITE_` and `NEXT_PUBLIC_` decide which variables cross into the bundle. They do nothing to the
value once it is there.

Vite: "Variables prefixed with `VITE_` will be exposed in client-side source code after Vite
bundling. To prevent accidentally leaking env variables to the client, avoid using this prefix." Its
own security note leaves nothing to interpret: "`VITE_*` variables should not contain sensitive
information such as API keys. The values of these variables are bundled into your source code at
build time. For production deployments, consider a backend server or serverless/edge functions to
properly secure secrets."

Next.js is the same shape with a different string. Unprefixed variables stay on the server;
`NEXT_PUBLIC_` ones are substituted into the client bundle by `next build`, which has a consequence
past secrecy: "After being built, your app will no longer respond to changes to these environment
variables." The value is frozen at the moment of the build, so one image promoted through staging
and production carries staging's value into both.

The substitution is textual, which is the other half of the surprise. Next.js: "dynamic lookups will
not be inlined, such as" `process.env[varName]`. Write the full static reference or you get
`undefined` in the browser and no error anywhere.

### Minification is not obfuscation

Minification renames bindings and deletes whitespace. A string literal is not a binding, so it
travels through unchanged and a search in the network tab finds it on the first try.

A source map goes further and hands over the original code, comments and all. Vite's
`build.sourcemap` defaults to `false`. Setting it to `true` means "a separate sourcemap file will be
created", and `'hidden'` "works like `true` except that the corresponding sourcemap comments in the
bundled files are suppressed", which is the setting for uploading maps to an error tracker without
also serving them from the CDN.

### The fix is a seam

Call the third party from your own server, and keep the key in that process's environment where it
is read at runtime and never serialised into a response. This is Vite's own advice: for production,
"consider a backend server or serverless/edge functions to properly secure secrets."

The seam pays for itself twice over even where the key is not sensitive. It is a place to
rate-limit, so one browser tab in a retry loop cannot spend your quota. And it is a place to log, so
"who called this and how often" becomes a question you can answer.

### What is genuinely publishable

Plenty of keys belong in the browser. The test is two-part: the vendor documents the key as public,
and the key's capabilities are scoped so that holding it is not the same as being you.

**A Stripe publishable key.** Stripe: "It's safe to embed this key in your code or apps." The
boundary is drawn tightly, and it is worth reading the rest of the sentence: "Only publishable keys
are safe to expose outside your application's backend. You're responsible for protecting other
Stripe API keys, including restricted API keys."

**A Firebase web config.** Firebase: "The content of the Firebase config file or object is
considered public, including … the Firebase project-specific values, like the API Key, project ID,
Realtime Database URL, and Cloud Storage bucket name." What does the enforcing instead is named in
the same breath: "use Firebase Security Rules to protect your data and files."

**A Sentry DSN.** Sentry: "DSNs are safe to keep public because they only allow submission of new
events and related event data; they do not allow read access to any information."

**A Google Maps key with restrictions on it.** This one is only publishable once you have scoped it.
Google's guidance pairs a Websites application restriction, where you "Always provide the whole
referrer string, including the protocol scheme, hostname and optional port (e.g.,
`https://google.com`)", with an API restriction so the key reaches only the APIs you named. Skip
that and the exposure is financial rather than confidential: "You are financially responsible for
charges caused by abuse of unrestricted API keys."

The pattern under all four is the same. Something other than secrecy is doing the enforcing: a
capability limit, a rules file, a write-only endpoint, a referrer check. A key that is public
because nobody thought about it has none of those.

### Rotation, because a leak is permanent

A key that reached a browser is not recoverable. Rewriting the commit does not help: the old object
stays in anyone's clone, in your CI caches, and in whatever proxy fetched the tarball. OWASP's
remediation order is revocation first: "Keys that were exposed should undergo immediate revocation",
then "A new secret must be able to be quickly created and implemented." Rotating on a schedule is
the same tool used ahead of time, "so that any stolen credentials will only work for a short time."

At runtime a secret belongs in the server process's environment or a secret manager, injected at
deploy time rather than at build time. How to hold and rotate them there, and where the environment
stops being enough, is [configuration and secrets](../production/config-and-secrets.md).

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
rather than written out, and Next.js only substitutes literal ones: "dynamic lookups will not be
inlined." `process.env[name]` and a destructured `const { NEXT_PUBLIC_X } = process.env` both fail
this way, silently, because there is nothing left to read at runtime in the browser.

**The environment variable changed, the container restarted, and the old value is still on screen.**
Build-time inlining means the value is part of the artifact: "After being built, your app will no
longer respond to changes to these environment variables." One image cannot serve two environments
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
financially responsible for charges caused by abuse of unrestricted API keys." Publishable and
unrestricted are not the same property. Set the referrer restriction and the API restriction, then
publish it.
