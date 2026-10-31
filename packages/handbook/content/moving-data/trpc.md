---
title: tRPC
question: There is no schema and no generated client. So how does the front end know the server's types?
order: 11
practise:
  - ts-return-type
  - ts-awaited
  - ts-indexed-access
  - ts-json-parse-any
sources:
  - author: tRPC
    title: Introduction
    url: https://trpc.io/docs
  - author: tRPC
    title: Concepts
    url: https://trpc.io/docs/concepts
  - author: tRPC
    title: Quickstart
    url: https://trpc.io/docs/quickstart
  - author: tRPC
    title: Define Routers
    url: https://trpc.io/docs/server/routers
  - author: tRPC
    title: Input & Output Validators
    url: https://trpc.io/docs/server/validators
  - author: tRPC
    title: Data Transformers
    url: https://trpc.io/docs/server/data-transformers
  - author: tRPC
    title: Response Caching
    url: https://trpc.io/docs/server/caching
  - author: tRPC
    title: FAQ / Troubleshooting
    url: https://trpc.io/docs/faq
verified: 2026-08-02
---

tRPC lets a TypeScript front end call functions on a TypeScript server and have the compiler check
every call, with no separate schema file and nothing generated. It works by handing the server's
types to the client at build time. That check covers only code the compiler can see in the same
build, and it says nothing about what actually arrives over the wire.

## The model

There is no contract file because the server's source is the contract. tRPC's own summary: it "lets
you build & consume fully typesafe APIs without schemas or code generation", using TypeScript's type
inference directly and "with no code generation step". Everything on this page is v11, the current
major.

The mechanism is one line. A router is an ordinary value, so its type can be read off it:

```ts
export type AppRouter = typeof appRouter;
```

The client is generic over that type. Nothing is generated, nothing is fetched at build time, and
nothing about the server ships to the browser, because the client imports a type and the docs are
firm about keeping it that way: "Export only the type of a router! This prevents us from importing
server code on the client", and type-only imports "are stripped at build time". This is
[deriving a type from a value](../typescript/the-type-level.md), applied to a whole API surface.

What that buys is a single check instead of a pipeline. Rename a field on the server and the call
site stops compiling in the same `tsc` run: no schema to regenerate, no generated client to forget to
regenerate, no window where the two disagree and both build. The compiler is the thing keeping them
honest, which is also the whole boundary condition, because a compiler only checks source it can see.

The wire is unremarkable. tRPC is "one implementation of RPC, designed for TypeScript monorepos", and
the docs tell you to stop reading HTTP into it: "You should ignore details like HTTP Verbs, since they
carry meaning in REST APIs but, in RPC, form part of your function names instead". Underneath, it is
still ordinary HTTP, and "Since all tRPC queries are normal HTTP `GET` requests, you can use standard
HTTP cache headers to cache responses." The complication is batching. `httpBatchLink` "automatically
batches up multiple calls into a single HTTP request", so one response can carry several procedures
and one set of headers has to be right for all of them, which is why tRPC's guidance is to set them
in `responseMeta` and "make sure that there are not any concurrent calls that may include personal
data", or to leave cache headers off entirely when there is an auth header or a cookie.

Two things are worth separating, because the name "typesafe" runs them together.

**Types are erased, so the runtime check is a different feature.** Input parsers are that feature:
`.input()` takes a validator, usually Zod, and "tRPC can check that a procedure call is correct and
return a validation error if not". That is real code running on a real request. The output type is
inference only unless you ask for more, and the docs say why you might: an `.output()` validator is
for "Checking that data returned from untrusted sources is correct" and to "Ensure that you are not
returning more data to the client than necessary". See
[what the compiler erases](../typescript/what-the-compiler-erases.md) for the general version of this.

**The guarantee is build-time and same-tree.** A monorepo is not required, but the FAQ is honest
about the cost: "you will lose some of the benefits of using tRPC if you don't use it since you will
lose guarantees that your client and server works together", and the suggested workaround is to
"publish a private npm package with the types of your backend repo". Once the types travel as a
published artifact you are back to versioning a contract, which is
[API versioning](../apis/versioning.md) again with fewer tools. And the consumer has to be TypeScript
in your build at all. A mobile app on a slower release train, a partner integration, a service
written in Go: for any of those the central trick does not fire, and you want a described contract a
stranger can read. tRPC requires TypeScript `>=5.7.2`, and strongly recommends `"strict": true`
because non-strict mode is not officially supported.

## Worked example

The server. `userById` takes a string, checked at runtime by Zod, and returns whatever the resolver
returns:

```ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export const appRouter = t.router({
  userById: t.procedure.input(z.string()).query(async (opts) => {
    // { id: string; name: string; joinedAt: Date }
    return await db.users.findById(opts.input);
  }),
});

// The only thing the client imports, and it compiles to nothing.
export type AppRouter = typeof appRouter;
```

The client. One type parameter is the entire integration:

```ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/appRouter';

const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000' })],
});

const user = await trpc.userById.query('1'); // '1' is checked, user is inferred
```

Rename `name` to `fullName` in the database layer and `user.name` here is a compile error, in the
same run, with nothing regenerated in between. When you need the shapes as named types (for a prop, a
form, a test fixture), `@trpc/server` exports helpers rather than making you write them out:

```ts
import type { inferRouterOutputs } from '@trpc/server';

type Outputs = inferRouterOutputs<AppRouter>;
type User = Outputs['userById']; // the resolved value, not the promise
```

## Traps

**Every call came back as `any` and autocomplete died.** Inference is a chain, and one broken link
takes out the whole thing rather than the part that broke. The FAQ's checklist is the order to work
in: no type errors anywhere in your code, `"strict": true` in the `tsconfig.json`, matching versions
across all your `@trpc/*` packages, TypeScript `>=5.7.2`, and an editor using the project's
TypeScript rather than its own bundled one.

**`user.joinedAt.getFullYear is not a function`.** The type says `Date` because the resolver returns
a `Date`, and JSON has no such thing, so what arrives is a string wearing the wrong type. The fix is a
data transformer such as superjson, which lets you "transparently use, e.g., standard
`Date`/`Map`/`Set`s over the wire", and the thing that catches people is the last clause of the
sentence after it: "The transformers need to be added both to the server and the client."

**A password hash turned up in a network response that typechecked.** The output type is inferred
from whatever the resolver returns, and inference has no opinion about returning too much; it will
faithfully type the extra fields and hand them to the browser. Selecting columns explicitly is the
first defence. An `.output()` validator is the one the compiler cannot skip, and it fails closed:
output validation failures come back as an `INTERNAL_SERVER_ERROR`.

**It compiles locally and 404s in production.** The types were checked against the server source in
your working tree, and the deployment was checked against nothing. In one repo built and shipped
together the two cannot drift. Split them across repos or release trains and the guarantee shrinks to
"the client agrees with the version of the types it was built against", which is a contract with a
version number whether or not anybody wrote one down.
