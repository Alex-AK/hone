---
title: Structural typing, and where it stops
question: These two types are both `string`. Why is passing the wrong one not an error?
order: 6
practise:
  - ts-branded-type
  - ts-union-vs-enum
  - ts-readonly-array
  - ts-noimplicit-index-access
  - ts-readonly-shallow
  - ts-handler-variance
sources:
  - author: TypeScript
    title: Type Compatibility
    url: https://www.typescriptlang.org/docs/handbook/type-compatibility.html
  - author: TypeScript
    title: Object Types
    url: https://www.typescriptlang.org/docs/handbook/2/objects.html
  - author: TypeScript
    title: Enums
    url: https://www.typescriptlang.org/docs/handbook/enums.html
  - author: TypeScript
    title: noUncheckedIndexedAccess
    url: https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html
  - author: Sindre Sorhus
    title: type-fest
    url: https://github.com/sindresorhus/type-fest
verified: 2026-08-01
---

## The model

TypeScript compares shapes, not names. The handbook calls it structural subtyping, "a way of
relating types based solely on their members", and says outright that this is in contrast with
nominal typing. Two types with the same members are the same type as far as assignability goes, and
nothing has to declare that it satisfies anything:

```ts
interface Point {
  x: number;
  y: number;
}
class Vector {
  constructor(
    public x: number,
    public y: number
  ) {}
}

const p: Point = new Vector(1, 2); // no `implements` anywhere
```

In Java or C# that is an error until `Vector` says it implements `Point`. Structural typing is what
makes an object literal you never named fit a parameter, a hand-rolled stub fit a service interface,
and a type definition describe a library written years before anyone typed it.

It is also exactly what fails when two different things share a shape:

```ts
type UserId = string;
type OrderId = string;

declare function cancel(id: OrderId): void;

const userId: UserId = 'usr_9f2';
cancel(userId); // compiles, and cancels an order that does not exist
```

The compiler is right. It was asked to compare `string` with `string`. An alias is a nickname, not a
new type, so the only way out is to make the two shapes genuinely different by adding a member that
no real value carries. That is a brand.

Three more places where the shape alone is not the answer:

- `readonly T[]` and `ReadonlyArray<T>` are the same type, spelled two ways, and they are the array
  without `push`, `sort`, `splice` and the rest. Assignability runs one way only: a `number[]` goes
  into a `readonly number[]` parameter, and a `readonly number[]` will not go back into a
  `number[]`. That direction is the point. It is also shallow, so `readonly Row[]` stops
  `rows.push(row)` and does nothing about `rows[0].tags.push('x')`.
- A union of string literals and an `enum` differ in what they cost and in how you get a value into
  one. The union is erased; an `enum` emits a real object into the bundle. The union accepts the
  literal `'active'` and accepts a `string` that a type guard has narrowed, which is how data from
  `JSON.parse` gets in; an enum refuses both, and refuses a second enum with identical members, so
  the only way to produce a member is to import the enum and name it. That is enums being nominal
  while everything around them is structural. Prefer the union, and get the runtime half from
  `const STATUSES = [...] as const` with `type Status = (typeof STATUSES)[number]`, which keeps both
  halves in one declaration. The handbook makes the same recommendation, that an object with
  `as const` covers most of what an enum was for.
- Structural typing tells you a value's shape matches. It does not tell you the value is there.
  `items[0]` is typed `string` even when the array is empty, which is a deliberate trade of
  soundness for ergonomics. `noUncheckedIndexedAccess` undoes it and gives you `string | undefined`.
  It is not part of `strict`, so most codebases never see it. It is on here: `tsconfig.base.json`
  sets it next to `strict`, and every package extends that file.

## Worked example

A brand, end to end. The type is a fiction; the constructor is the part that does real work:

```ts
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

type UserId = Brand<string, 'UserId'>;
type OrderId = Brand<string, 'OrderId'>;

function toOrderId(raw: string): OrderId {
  if (!/^ord_[a-z0-9]+$/.test(raw)) throw new Error(`not an order id: ${raw}`);
  return raw as OrderId; // the one place a cast is allowed
}

declare function cancel(id: OrderId): void;
declare const userId: UserId;

cancel(userId); // error: UserId is not assignable to OrderId
cancel('ord_9f2'); // error: a plain string cannot walk in
cancel(toOrderId('ord_9f2')); // fine
```

A `unique symbol` for the key means nothing can produce the property by accident. The branded value
is still a string everywhere it needs to be, so `userId.toUpperCase()` and
`const s: string = userId` both work. Here is what `toOrderId` compiles to:

```js
function toOrderId(raw) {
  if (!/^ord_[a-z0-9]+$/.test(raw)) throw new Error(`not an order id: ${raw}`);
  return raw;
}
```

The brand is gone, along with [everything else at the type level](./what-the-compiler-erases.md). So
the cost is honest and worth stating: the type gives you nothing at runtime, and a value only enters
it through a cast. Concentrating that cast in one validating constructor is the whole trade, and it
is the case where [`as` is the right tool](./as-annotation-satisfies.md). type-fest packages the
pattern as `Tagged`, listed under its older names `Branded` and `Opaque`.

## Traps

**Two ids, swapped, and nothing complained.** A `UserId` reached a function wanting an `OrderId`,
and both are aliases of `string`. Nothing in the type system separates them, and no amount of naming
will. Brand them, or accept that this bug is caught at runtime or not at all. Money in cents, email
addresses and already-escaped HTML are the same problem wearing different clothes.

**A helper sorted the caller's array.**
`function top(items: number[]) { return items.sort(...)[0] }` reorders the array it was handed,
because `sort` mutates. Take `readonly number[]` and the compiler rejects the `sort` call. Then copy
first, `[...items].sort(...)`, or use `toSorted`, which returns a new array and is declared on
readonly arrays. `toSorted` needs the ES2023 lib, and this repo targets ES2022, so here it is the
copy.

**`arr[0]` was `undefined` and the type said otherwise.** Without `noUncheckedIndexedAccess`,
`const first: string = items[0]` compiles against an empty array and throws on the next line. With
it on, index access and destructuring both give you `string | undefined`, while `for...of` and
`.map` are untouched. One thing the flag does not do is connect a length check to the access: inside
`if (items.length > 0)`, `items[0]` is still possibly undefined, so you need
[the narrowing](./narrowing.md) on the value itself, or `items.at(0)?.toUpperCase()`.

**A `const enum` behaved differently in dev and in the build.** `tsc` inlines `Level.Low` to `1` and
emits an empty module for the file that declared it. A transpiler working one file at a time cannot
see across the import, so esbuild in transpile-only mode keeps the import and emits an ordinary
runtime enum object, then inlines it properly once it bundles. Same source, two shapes, and none of
the guarantee you wrote `const` for. Ambient ones are a harder stop: reading a `declare const enum`
under `isolatedModules` is error TS2748. The handbook's own advice is to ban const enums or at least
never publish ambient ones.
