---
title: The type level is its own language
question: How do I compute a type from another type instead of writing it out again?
order: 5
practise:
  - ts-keyof
  - ts-indexed-access
  - ts-partial
  - ts-omit
  - ts-record
  - ts-partial-vs-optional-update
  - ts-mapped-key-remap
  - ts-conditional-infer
  - ts-template-literal-type
  - ts-never-distributes
  - ts-distributive-omit
sources:
  - author: TypeScript
    title: Keyof Type Operator
    url: https://www.typescriptlang.org/docs/handbook/2/keyof-types.html
  - author: TypeScript
    title: Indexed Access Types
    url: https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html
  - author: TypeScript
    title: Mapped Types
    url: https://www.typescriptlang.org/docs/handbook/2/mapped-types.html
  - author: TypeScript
    title: Conditional Types
    url: https://www.typescriptlang.org/docs/handbook/2/conditional-types.html
  - author: TypeScript
    title: Template Literal Types
    url: https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html
  - author: TypeScript
    title: Utility Types
    url: https://www.typescriptlang.org/docs/handbook/utility-types.html
  - author: Sindre Sorhus
    title: type-fest
    url: https://github.com/sindresorhus/type-fest
verified: 2026-08-01
---

## The model

The annotations are a second language running beside the JavaScript, and it has the pieces you would
expect a language to have: values, a way to read a property, iteration, a conditional and pattern
matching. Its values are types. Once you can name the piece you need, the syntax stops looking like
a bag of tricks.

`keyof T` is the key union. `keyof Settings` is `'theme' | 'fontSize' | 'autosave'`, derived from
the interface rather than typed out beside it. On a type with a string index signature it is
`string | number`, because JavaScript coerces object keys to strings and `obj[0]` is `obj["0"]`.

`T[K]` reads a property's type, with the same brackets and the same meaning as at the value level.
`Settings['fontSize']` is `number`. Index with a union and you get a union, so
`Settings['theme' | 'fontSize']` is `string | number` and `Settings[keyof Settings]` is every value
type at once. Arrays index with `number`, which is what makes `(typeof STATUSES)[number]` turn a
const tuple into a union.

The pair is what keeps a getter honest when the property it returns changes type:

```ts
function get<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

get(settings, 'fontSize'); // number
get(settings, 'theme'); // string
get(settings, 'colour'); // error: not a key of Settings
```

A mapped type is the loop. `{ [K in keyof T]: T[K] }` walks the keys and builds a new object type,
and the utility types you already reach for are one line each:

```ts
type Partial<T> = { [K in keyof T]?: T[K] };
type Required<T> = { [K in keyof T]-?: T[K] };
type Readonly<T> = { readonly [K in keyof T]: T[K] };
type Pick<T, K extends keyof T> = { [P in K]: T[P] };
type Record<K extends keyof any, V> = { [P in K]: V };
type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;
```

None of them is a built-in doing something you could not have written, which is what lets you write
the one the standard library does not have.

An `as` clause renames each key on the way out, and it has nothing to do with a type assertion.
Writing ``[K in keyof T as `on${Capitalize<K & string>}`]`` turns `id` into `onId`. The
`K & string` is there because `keyof T` also covers `number | symbol` while `Capitalize` only takes
strings. Map a key to `never` rather than to a name and it drops out of the result, so renaming and
filtering between them cover most bespoke utility types.

`T extends U ? X : Y` is the conditional, and `infer` is the pattern match. It declares a type
variable inside the pattern being matched, binds whatever lands in that position, and is readable
only in the true branch:

```ts
type ElementOf<T> = T extends (infer U)[] ? U : never;
type ReturnType<T> = T extends (...args: never[]) => infer R ? R : never;
```

Template literal types build strings out of parts, and an interpolated union expands to the cross
product: `` `${Method}:${Resource}` `` over two methods and two resources is all four routes. Four
intrinsics come with them: `Uppercase`, `Lowercase`, `Capitalize` and `Uncapitalize`.

All of it exists to make one thing true. A type derived from `User` follows `User`, so the key list
that went stale after a rename stops being something review has to catch and becomes an error the
compiler already had. None of it reaches the running program, which is
[what the compiler erases](./what-the-compiler-erases.md).

## Worked example

One source of truth, and four types that follow it:

```ts
type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

// the fields a person is allowed to change, named once
type Editable = Omit<User, 'id' | 'createdAt'>;

// the PATCH body: any subset of those
type Patch = Partial<Editable>;
//   { name?: string; email?: string }

// one handler per field, with the name built from the field name
type Handlers = {
  [K in keyof Editable as `on${Capitalize<K>}`]: (value: Editable[K]) => void;
};
//   { onName: (value: string) => void; onEmail: (value: string) => void }

// one validator per field, and every key required
type Validators = Record<keyof Editable, (value: string) => string | null>;
```

Add `avatarUrl` to `User` and all four move with it. `Patch` starts accepting it, `Handlers` starts
demanding an `onAvatarUrl`, and `Validators` refuses to compile until you write one. That last part
is the payoff: the error lands in the file that was about to be wrong, on the day the field was
added, rather than in a bug report later.

## Traps

**A rename left `Omit` omitting nothing.** `Omit<User, 'idd'>` compiles and hands back `User`
unchanged, because the key parameter of `Omit` is not constrained to `keyof T`. `Pick<User, 'idd'>`
errors on the same typo, which is one reason to prefer `Pick` when the set you want is small. The
other fix is a strict version, declared once: `type Except<T, K extends keyof T> = Omit<T, K>`
rejects `'idd'`. type-fest ships that as `Except`, for exactly this reason.

**Your update type lets the client change the id.** `Partial<User>` makes every field optional, and
"every" includes the ones an update must never touch. It also drops the id you needed, so
`{ name: 'Ada' }` type-checks with nothing to apply it to. Take the id as its own required parameter
and give the body `Partial<Omit<User, 'id' | 'createdAt'>>`.

**Your conditional type answered `boolean`.** A conditional whose checked type is a bare type
parameter distributes over a union, evaluating each member separately and joining the answers, so
`IsString<string | number>` is `true | false`, which is `boolean`. That is usually the behaviour you
want, and it is why `ElementOf<string[] | number[]>` is `string | number`. When it is not, wrap both
sides in a tuple so the union arrives as one type: `[T] extends [string] ? true : false` answers
`false`. The same trick is the only way to test for `never`, because distributing over the empty
union produces `never` instead of an answer.

**A mapped type over a union did nothing at all.** `{ [K in keyof T]: boolean }` looks like it
should turn `'get' | 'post'` into `{ get: boolean; post: boolean }`. It hands back `'get' | 'post'`
untouched, because a mapped type of that shape applied to a primitive gives the primitive back. You
wanted `{ [K in T]: boolean }`, which is `Record<T, boolean>`. Constraining the parameter,
`<T extends object>`, turns the mistake into an error, which is the argument the
[generics](./generics-and-inference.md) page makes at length. Over a union of objects the mapped
type distributes instead, so `Partial<A | B>` is `Partial<A> | Partial<B>` rather than one merged
shape, and `keyof (A | B)` narrows to only the keys both members share.
