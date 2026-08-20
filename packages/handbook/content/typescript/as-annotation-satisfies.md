---
title: `as`, an annotation, and `satisfies`
question: These three look like they do the same thing. Which one actually checks anything?
order: 2
practise:
  - ts-as-vs-annotation
  - ts-satisfies
  - ts-satisfies-keeps-literals
  - ts-as-const
  - ts-excess-property
  - ts-as-const-not-frozen
  - ts-as-const-satisfies
sources:
  - author: TypeScript
    title: 'Everyday Types: Type Assertions'
    url: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
  - author: TypeScript
    title: 'Object Types: Excess Property Checks'
    url: https://www.typescriptlang.org/docs/handbook/2/objects.html
  - author: TypeScript
    title: 'TypeScript 4.9: The satisfies Operator'
    url: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html
  - author: TypeScript
    title: 'TypeScript 3.4: const assertions'
    url: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html
  - author: MDN
    title: Object.freeze()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
verified: 2026-08-01
---

## The model

Separate the three with two questions: does it check the value, and what type does the variable end up
with?

**An annotation**, `const x: T = value`, checks the value against `T` and then makes the variable `T`.
It checks, and it widens: whatever the compiler inferred from the literal is discarded and replaced
with the type you declared.

**`as`**, `const x = value as T`, checks nothing about the value. It overrides the inferred type and
the compiler moves on. The handbook is blunt about the consequence: "Because type assertions are
removed at compile-time, there is no runtime checking associated with a type assertion." It is the
only one of the three that can turn out to be wrong while the program is running.

**`satisfies`**, `const x = value satisfies T`, added in TypeScript 4.9, runs the same check the
annotation runs and then leaves the inferred type alone. It checks, and it does not widen. That
combination is the entire reason the operator exists.

`as` is not a cast. It converts nothing and emits nothing, which is the subject of
[what the compiler erases](./what-the-compiler-erases.md). Its only limit is overlap: TypeScript
refuses an assertion between two types when neither is assignable to the other, so `'x' as number` is
an error that tells you to "convert the expression to 'unknown' first". That is where
`as unknown as T` comes from, and why it is worth stopping on in a diff: it means the two types had
nothing in common and somebody overruled the compiler anyway. What `as` allows quietly is a subset, so
`{ id: '1' } as User` compiles even when `User` declares two more required fields.

`as const` is a different tool for a related job. It stops widening at the source rather than at the
check: literal types stay literal, object properties become `readonly` all the way down, and array
literals become readonly tuples. Reach for it when the values themselves are the point, such as a list
you want a union from. [Generics and inference](./generics-and-inference.md) covers the widening rules
it is opting out of.

One rule cuts across all of this. An object literal written straight into a typed position is checked
for keys the target does not declare, and the same object passed through a variable is not. The check
follows the literal, not the type, so naming a value is enough to lose it.

## Worked example

A config object, annotated and then checked. Both lines are validated against `Config`; only one of
them still knows what it holds afterwards.

```ts
type Config = { env: 'production' | 'staging'; region: string };

const annotated: Config = { env: 'production', region: 'eu-west-1' };
const checked = { env: 'production', region: 'eu-west-1' } satisfies Config;

annotated.env; // 'production' | 'staging'  ← widened to the declared type
checked.env; // 'production'                ← the literal survived the check
```

The same split decides whether the keys survive, which is the version you meet first:

```ts
const routesA: Record<string, string> = { home: '/', about: '/about' };
const routesB = { home: '/', about: '/about' } satisfies Record<string, string>;

routesA.typo; // string, and no error
routesB.typo; // TS2339: Property 'typo' does not exist

type A = keyof typeof routesA; // string
type B = keyof typeof routesB; // 'home' | 'about'
```

Neither object escaped validation: put a number in either one and it fails. The annotation charged you
the keys for it. Writing `as Record<string, string>` instead would land on the same widened type as
`routesA` and skip the check as well, which is the worst of both.

When you want the check, the literal types and a deep `readonly`, stack the two:

```ts
const routes = { home: '/', about: '/about' } as const satisfies Record<string, string>;
// { readonly home: '/'; readonly about: '/about' }
```

## Traps

**The error landed three files from the line that caused it.** `await res.json()` is typed `any`, so
`const users = (await res.json()) as User[]` is a claim nobody verifies. When the body was actually
`{ items: [...] }`, the compiler stays quiet through every file in between and the failure appears at
whoever first calls `users.map`. The assertion was the only place the shape was ever stated and the
one place it was never checked. Start at `unknown` and narrow with a guard instead, which is what
[narrowing](./narrowing.md) is for.

**The union you wanted is gone.** Annotate a config with `Record<string, string>` and
`keyof typeof config` is `string`: nothing autocompletes, and every typo is a legal lookup.
`Object.keys` will not rescue it either, because it returns `string[]` no matter what the object's type
is. The union has to come from `keyof typeof`, and only `satisfies` leaves one there to read.

**A typo the compiler catches inline and waves through from a variable.**
`createClient({ retries: 3, timeoutMs: 1000 })` is TS2561, "Did you mean to write 'timeout'?". Pull
that literal out into a `const` and pass the variable, and it compiles. Excess property checking fires
only on a fresh literal, and naming the value spends the freshness; underneath it, structural typing
permits the extra property. Put the check back by adding `satisfies Options` to the variable.

**`as const` did not freeze anything.** It is type-level and it is erased, so `Object.isFrozen(config)`
is `false` and any JavaScript that never saw the types writes to that object without complaint.
`readonly` is a compile-time promise. `Object.freeze` is the runtime one, and MDN notes that it is
shallow, which is the opposite of how `as const` goes all the way down.
