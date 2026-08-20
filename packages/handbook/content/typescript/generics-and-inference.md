---
title: Generics and inference
question: Why did my generic come back as `string` instead of the exact value I passed?
order: 4
practise:
  - ts-generic-constraint
  - ts-generic-component-props
  - ts-return-type
  - ts-await-typing
  - ts-awaited
  - ts-overload-signature
  - ts-const-type-param
  - ts-no-infer
sources:
  - author: TypeScript
    title: Generics
    url: https://www.typescriptlang.org/docs/handbook/2/generics.html
  - author: TypeScript
    title: More on Functions
    url: https://www.typescriptlang.org/docs/handbook/2/functions.html
  - author: TypeScript
    title: Utility Types
    url: https://www.typescriptlang.org/docs/handbook/utility-types.html
  - author: TypeScript
    title: The typeof Type Operator
    url: https://www.typescriptlang.org/docs/handbook/2/typeof-types.html
  - author: TypeScript
    title: TypeScript 5.0 release notes
    url: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html
  - author: MDN
    title: await
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await
verified: 2026-08-01
---

## The model

A generic parameter is a type the caller supplies, and almost no caller supplies it. The compiler
reads it off the arguments instead, which the handbook calls type argument inference: it looks at
the value you passed and sets the type parameter to that value's type. So the question is never
whether you passed a type. It is what the compiler decided you passed.

The default is to widen. A string literal argument infers `string`:

```ts
declare function first<T>(xs: readonly T[]): T;

const status = first(['draft', 'live']); // string, not 'draft' | 'live'
```

Two things stop that, and both live in the signature.

The first is `extends`, which does double duty. It restricts who can call you, and it gives the body
something to work with. Without it a type parameter is opaque, whatever you pass:

```ts
function byId<T>(items: T[]) {
  return new Map(items.map((i) => [i.id, i])); // Property 'id' does not exist on type 'T'
}
```

Adding the minimum shape fixes the body and keeps the caller's exact type on the way out:

```ts
function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

byId(users); // Map<string, User>
```

Typing the parameter as `{ id: string }[]` compiles too, and returns `Map<string, { id: string }>`
with every other field of `User` discarded. That difference is the whole reason to reach for a
generic here.

The second is the `const` modifier on the type parameter, added in TypeScript 5.0 to make
"`const`-like inference the default". It moves the requirement into the signature, so you write it
once instead of asking every caller to remember [`as const`](./as-annotation-satisfies.md):

```ts
declare function pick<const T>(xs: readonly T[]): T;

const status = pick(['draft', 'live']); // 'draft' | 'live'
```

It applies to a literal written at the call site. Pass a variable and you get whatever that variable
was already widened to, because the widening happened at its declaration.

The generic React component is where this stops being academic. Props are a type like any other, so
they take a parameter:

```tsx
type Props<T> = {
  items: readonly T[];
  renderItem: (item: T) => React.ReactNode;
};

function List<T>({ items, renderItem }: Props<T>) {
  return <ul>{items.map(renderItem)}</ul>;
}

<List items={users} renderItem={(u) => u.name} />; // u is User
```

`T` is inferred from `items` at each call site and arrives in `renderItem` with no annotation from
the caller. Arrow components in a `.tsx` file need `<T,>` with the trailing comma, since `<T>` alone
parses as JSX.

The same inference machinery is available deliberately, through `typeof` in type position and the
utility types that read pieces out of it:

- `ReturnType<F>` — what the function returns.
- `Parameters<F>` — its parameter list, as a tuple.
- `Awaited<T>` — what a promise resolves to.

`type Config = ReturnType<typeof buildConfig>` follows the implementation instead of drifting from
it, which is the habit that keeps derived types honest as the code changes.

## Worked example

A promise is where deriving a type most often goes one step short. Start with the runtime version of
the mistake:

```ts
const user = api.getUser(id);
user.name; // Property 'name' does not exist on type 'Promise<User>'
```

Now the same mistake at the type level. An async function's return type is the promise, so anything
derived from it is a promise too:

```ts
async function loadUser() {
  return db.users.findOne(id);
}

type A = ReturnType<typeof loadUser>; // Promise<User>
type B = Awaited<ReturnType<typeof loadUser>>; // User
```

`Awaited` exists because `await` does more than peel one layer. The handbook describes it as
modelling "the way that they recursively unwrap `Promise`s", and that is the part a hand-rolled
version misses:

```ts
type C = Awaited<Promise<Promise<string>>>; // string
type D = Awaited<number>; // number, left alone
type E = Awaited<Promise<string> | number>; // string | number, distributed

type Naive<T> = T extends Promise<infer U> ? U : T;
type F = Naive<Promise<Promise<string>>>; // Promise<string>, one layer only
```

`Naive` is a conditional type with `infer`, which the [type level](./the-type-level.md) page covers.
It handles the easy case and stops. `Awaited<ReturnType<typeof fn>>` is the idiom worth keeping: it
ties a client type to the function that produces it, through the promise.

## Overloads

An overload set is a list of signatures callers can see, plus one implementation signature they
cannot. The handbook is blunt about the last part: "The signature of the implementation is not
visible from the outside." It exists to type-check the body, and the body is where you
[narrow](./narrowing.md) the argument back down.

Resolution walks the visible list top to bottom and takes the first signature that accepts the
arguments on its own. That last phrase is the trap:

```ts
function load(source: string): Promise<string>;
function load(source: URL): Promise<string>;
function load(source: string | URL): Promise<string> {
  return readFile(typeof source === 'string' ? source : source.pathname);
}

declare const input: string | URL;
load(input); // TS2769: No overload matches this call
```

A `string` works. A `URL` works. A value that is either satisfies neither entry, and the
implementation signature is not in the running. Hence the handbook's advice to "always prefer
parameters with union types instead of overloads when possible": one signature taking `string | URL`
accepts everything the pair did, plus the union. Overloads earn their place when the return type
depends on which argument was passed.

## Traps

**The helper handed back `string` when you wanted the literal union.** The type parameter widened at
the call site, which is the default. Put a `const` modifier on it so every caller gets the literals,
or constrain it (`T extends string`), or make the one caller write `as const`. The first is the one
you write once.

**The body cannot read a property off its own type parameter.** `Property 'id' does not exist on
type 'T'` means the constraint is missing or too loose, and a bare `T` stays opaque no matter what
gets passed. Add the minimum shape with `extends`. Widening the parameter to `{ id: string }[]`
silences it and throws the caller's type away on the way out.

**The call is rejected and every member of the argument's union is legal on its own.** The compiler
needs one signature that accepts the whole argument type, and a union spread across two overloads
does not count. Add a third overload for the union, or drop the overloads for a single signature
that takes it.

**`ReturnType<typeof fn>` gave you a type from the wrong function.** On an overloaded function it is
the return type of the _last_ signature, and `Parameters` is that signature's parameters. Neither
looks at the rest. Order the overloads so the useful one is last, or write the type out by hand.

**An `await` on something that was never a promise.** It compiles, and `await 42` is `number`, so
nothing complains. It is not free either: MDN says that if the value is not a promise, `await`
converts it to a resolved promise and waits for it, so the function still pauses until the next
tick. A wasted microtask usually means you thought the call was async.
