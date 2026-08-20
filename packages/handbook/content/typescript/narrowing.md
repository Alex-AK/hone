---
title: Narrowing and control flow
question: I checked for null on the line above. Why does it still think this might be null?
order: 3
practise:
  - ts-discriminated-union
  - ts-narrow-in-operator
  - ts-exhaustive-never
  - ts-assertion-function
  - ts-optional-vs-undefined
  - ts-falsy-vs-nullish
  - ts-assert-defined
sources:
  - author: TypeScript
    title: Narrowing
    url: https://www.typescriptlang.org/docs/handbook/2/narrowing.html
  - author: TypeScript
    title: TypeScript 3.7 release notes
    url: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html
  - author: TypeScript
    title: TypeScript 4.6 release notes
    url: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-6.html
  - author: TypeScript
    title: TypeScript 5.4 release notes
    url: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-4.html
  - author: MDN
    title: Falsy
    url: https://developer.mozilla.org/en-US/docs/Glossary/Falsy
verified: 2026-08-01
---

## The model

At every point in a function the compiler holds a set of types a value could be. It starts as the
declared type and only shrinks: each check that rules a member out narrows what is left, and control
flow analysis carries that from one line to the next. None of it exists at runtime. You write an
ordinary JavaScript check that the compiler recognises, and it updates its own bookkeeping either
side of the branch.

The checks it recognises, roughly in the order you reach for them:

```ts
if (typeof v === 'string') {
} // primitives
if (v) {
} // truthiness: removes null, undefined and everything else falsy
if (v !== null) {
} // equality, against null, undefined or a literal
if (v instanceof Date) {
} // classes, through the prototype chain
if ('error' in v) {
} // a union of object types with no shared field
```

`in` is the tool for a union you did not design: two response shapes from somebody else's API,
distinguishable only by which key they carry. When you do control the shape, give every member the
same field with a **literal** type and switch on it.

```ts
type Result = { status: 'ok'; data: string } | { status: 'error'; message: string };
```

That is a discriminated union, and it is the shape worth designing towards, because it narrows on
one comparison and it exhausts. Exhausting is the part that pays for itself.
[`never`](./the-type-level.md) is the type nothing is assignable to, so in a `default` branch where
every member has already been handled, the value's remaining type is `never` and the assignment
compiles. Miss one and it stops compiling.

An assertion function narrows with no branch at all. `asserts value is User` declares that the
function throws when the check fails, so reaching the line after the call is itself the proof, and
the value stays narrowed for the rest of the scope. The bare `asserts condition` form does the same
for any expression, so `assertOk(job.error !== null)` narrows `job.error` from there on. One rule
catches people out, and its message is not obvious:

```
Assertions require every name in the call target to be declared with an explicit type annotation.
```

A `function` declaration satisfies it. `const assertIsUser = (v: unknown): asserts v is User => {}`
does not, because the annotation is on the arrow rather than on the name being called, and neither
does reaching the assertion through an object literal whose type was inferred. Put the type on the
`const` (`const assertIsUser: (v: unknown) => asserts v is User = …`) or write a declaration.

## Worked example

A union narrowed, exhausted, and then extended:

```ts
type Shape = { kind: 'circle'; radius: number } | { kind: 'square'; side: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'square':
      return shape.side ** 2;
    default: {
      const exhaustive: never = shape;
      throw new Error(`Unhandled shape: ${JSON.stringify(exhaustive)}`);
    }
  }
}
```

Now add `{ kind: 'triangle'; base: number; height: number }` to `Shape` and change nothing else.
Both handled cases are narrowed away as before, but a third member is now left standing in
`default`:

```
Type '{ kind: "triangle"; base: number; height: number; }' is not assignable to type 'never'.
```

One line of code turned a silent fallthrough into a build failure, at every switch in the codebase
that needs updating. Keep the `throw` as well: types are
[erased before anything runs](./what-the-compiler-erases.md), so a value that never met the compiler
can still arrive here.

## Traps

**You checked the property, then read it inside a callback.** Narrowing on `obj.prop` does not cross
into a function you pass somewhere, and `readonly` does not save it:

```ts
if (job.error !== null) {
  run(() => console.log(job.error.length)); // 'job.error' is possibly 'null'
}
```

An ordinary call is fine, which surprises people the other way round. Calling `log()` between the
check and the read compiles, even though `log` could have cleared the field. That is a known
unsoundness the compiler accepts. A closure is where it stops trusting you. Read the property into a
local first and check that, because narrowing on a `const` does survive:

```ts
const error = job.error;
if (error !== null) run(() => console.log(error.length)); // fine
```

A `let` sits in between. Since 5.4 it narrows inside a closure created after its last assignment, so
the same code compiles until somebody adds a `value = null` further down the function, at which
point the callback breaks and the line that broke it is nowhere near the error.

**The count of zero disappeared.** `if (count)` is a check for truthiness, not for presence, and
MDN's falsy list includes `0`, `-0`, `0n`, `''` and `NaN` alongside `null` and `undefined`. On
`number | undefined` that quietly routes zero down the "missing" path. Write the check you mean:
`count !== undefined` for one nullish value, `count != null` for both.

**You destructured it before the check.** The compiler tracks references, and once a value has been
copied out, a later check on the original tells it nothing about the copy:

```ts
const { error } = job;
if (job.error !== null) error.length; // 'error' is possibly 'null'
```

Destructuring a discriminated union is the exception. Since 4.6 the members come out linked, so
checking the destructured `kind` narrows the destructured payload alongside it, as long as both are
`const` and neither is reassigned.

**The tag is typed `string`, so nothing narrows.** A discriminant only works as a literal type. If
the union was built from interfaces where `kind: string`, `if (r.kind === 'ok')` is a comparison
between two strings and the branch still holds the whole union. Declare the field as
`kind: 'ok'`, or reach for [`as const` and `satisfies`](./as-annotation-satisfies.md) when the shape
comes from a value rather than a type.

**`name?: string` and `name: string | undefined` are not the same type.** Reading either gives you
`string | undefined` and you narrow both identically, so the difference never shows up at the use
site. It shows up at the call site: `?` makes the key optional, and only the second one forces a
caller to write it out.

```ts
const a: { name?: string } = {}; // fine
const b: { name: string | undefined } = {}; // Property 'name' is missing
```

Use the second when the field is a decision somebody has to make rather than a setting they may
leave out.
