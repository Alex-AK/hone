---
title: What the compiler erases
question: If the types are gone at runtime, what was the compiler actually protecting me from?
order: 1
practise:
  - ts-json-parse-any
  - ts-unknown-vs-any
  - ts-catch-unknown
  - ts-type-guard
  - ts-non-null-assertion
  - request-boundary-zod
sources:
  - author: TypeScript
    title: Everyday Types
    url: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
  - author: TypeScript
    title: Narrowing
    url: https://www.typescriptlang.org/docs/handbook/2/narrowing.html
  - author: TypeScript
    title: TypeScript 4.4 release notes
    url: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-4.html
  - author: TypeScript
    title: TypeScript 5.8 release notes
    url: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html
  - author: MDN
    title: JSON.parse()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse
verified: 2026-08-01
---

TypeScript checks your types and then deletes them, so the program that runs is plain JavaScript
with no types left in it. That makes the checking a promise about your own code fitting together,
and says nothing about data arriving from outside. A server response or a parsed string can be any
shape at all, and only code that runs can tell you which.

## The model

The compiler reads your types, checks them against each other, and deletes them. Compile this:

```ts
export function greet(user: User, id: Id): string {
  const el = document.getElementById('root')!;
  return (user as { id: string }).id + id + el.tagName;
}
```

and what ships is this:

```js
export function greet(user, id) {
  const el = document.getElementById('root');
  return user.id + id + el.tagName;
}
```

The interface, the alias, the parameter types, the `as` and the `!` are all gone. The handbook says
it about assertions specifically: "Like a type annotation, type assertions are removed by the
compiler and won't affect the runtime behavior of your code."

A short list of TypeScript-only syntax is exempt, because it emits code rather than describing it.
An `enum` becomes a real object. A parameter property, `constructor(private repo: Repo)`, becomes an
assignment in the constructor body. TypeScript 5.8 added `erasableSyntaxOnly` to ban exactly that
set: enums, namespaces with runtime code, parameter properties, and `import =`/`export =`. This repo
has a third case, because `apps/server/tsconfig.json` turns on `emitDecoratorMetadata`, which writes
constructor parameter types into the output as `__metadata('design:paramtypes', [Repo])` so Nest can
read them for injection. That is the one place an annotation survives as a value.

Everything else is erased, and that fixes the compiler's job description. It protects the code you
wrote from the rest of the code you wrote. It cannot protect the boundary, because at the boundary
there is no code of yours to check: a fetch response, `JSON.parse`, `localStorage.getItem`, a query
parameter, a form body. Each one arrives as bytes another system produced, and nothing runs to
confirm they match the type sitting next to them.

`JSON.parse` is the widest hole, because the standard library declares it returning `any`:

```ts
parse(text: string, reviver?: (this: any, key: string, value: any) => any): any;
```

`any` assigns to anything, and every property read off it is `any` in turn, which is why it does not
stay on one line. It flows into whatever you derive from it, out through the inferred return type of
the function that touched it, and into the next file that imports that.

`unknown` is the type for a value nobody has checked yet. It accepts every value, the way `any`
does, and then permits nothing:

```ts
declare const raw: unknown;

raw.name; // TS18046: 'raw' is of type 'unknown'
raw(); // TS18046
'id' in raw; // TS18046
const s: string = raw; // TS2322: Type 'unknown' is not assignable to type 'string'
```

That refusal is the entire point. `unknown` does not make the value safe, it makes the unsafe step
somewhere you have to write code. The step is [narrowing](./narrowing.md), and the way to package it
is a user-defined type guard: a function whose return type is `value is User` rather than `boolean`.
A `true` result then narrows the argument at the call site.

The compiler takes that predicate on trust. It checks that the function returns a boolean, not that
your checks prove anything, so this compiles clean:

```ts
function isNumber(value: unknown): value is number {
  return typeof value === 'string';
}
```

A guard is a claim you are making about runtime, in the same family as
[`as`](./as-annotation-satisfies.md). `!` is the same claim with the check deleted too: it removes
`null` and `undefined` from a type, emits no JavaScript, and asks nothing of the value.

## Worked example

The caught value is the boundary you meet most often, because anything can be thrown.

```ts
try {
  await save(draft);
} catch (error) {
  logger.error(error.message); // TS18046: 'error' is of type 'unknown'
}
```

`useUnknownInCatchVariables` arrived in TypeScript 4.4, and the release notes say it "is enabled
under the `strict` family of options". This repo's `tsconfig.base.json` sets `"strict": true` and
never turns it back off, and every package extends that file, so the error above is the one you get
here.

The compiler is being honest rather than pedantic. `throw` takes any value, and a rejected promise
carries whatever was handed to `reject`, which for plenty of libraries is a plain object. Narrow it
with a check that exists at runtime:

```ts
} catch (error) {
  logger.error(error instanceof Error ? error.message : String(error));
}
```

`instanceof` is a runtime test the compiler understands, so the true branch is an `Error` and
`.message` is legal. `String(error)` covers the rest: `throw 'boom'` gives you a value whose
`.message` is `undefined` and whose `String()` is `'boom'`.

One caveat on `instanceof Error`. It compares against the `Error` constructor of the current realm,
so an error thrown out of a `node:vm` context, a worker or an iframe answers `false` while still
being an error with a `message`. Code that has to survive that checks for the property instead.

## Traps

**The API response was typed, and at runtime it was a string.**
`const user: User = await res.json()` compiles because `json()` resolves to `any`, and the
annotation is a description, not a check. The endpoint started returning `{ error: "..." }` last
Tuesday and nothing noticed until `user.items.map is not a function`. Give the boundary a real
parse: type the raw value `unknown`, validate it, and let the `User` type come out of the validation
rather than being asserted over it.

**One `JSON.parse` switched off checking in three files.** A helper returns `JSON.parse(text)` with
no annotation, so its inferred return type is `any`. The caller exports a value derived from it,
still `any`. A third file imports that, passes it to a function declared `(p: string)`, and calls
`.toUpperCase().length.nope.nope` on it. All three files typecheck. Annotating the helper's return
type is what stops the spread at the door.

**`error.message` was undefined in the log.** Something threw a string, or rejected with one, so the
caught value has no `message` and the log line reads `undefined`. Reaching for a cast repeats the
mistake: `logger.error((error as Error).message)` compiles, and changes nothing about what is in
`error`. `instanceof Error` is the version that actually looks.

**The `!` was true when you wrote it.** `document.getElementById('root')!` was fine while the call
sat after the DOM was ready, then somebody moved it into a module imported at the top of the entry
file, and now it is `null` and the next line throws. The assertion never re-checked anything,
because there was nothing to re-check. An explicit
`if (!el) throw new Error('#root is missing from index.html')` costs one line and fails with a
sentence that names the problem.
