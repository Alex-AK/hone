---
title: Dependency injection
question: Why is my injected service undefined when the file plainly imports it?
order: 6
practise:
  - node-interface-is-not-a-di-token
  - auth-guard-nestjs
sources:
  - author: NestJS
    title: Providers
    url: https://docs.nestjs.com/providers
  - author: NestJS
    title: Custom providers
    url: https://docs.nestjs.com/fundamentals/custom-providers
  - author: NestJS
    title: Circular dependency
    url: https://docs.nestjs.com/fundamentals/circular-dependency
  - author: TypeScript
    title: 'TSConfig reference: emitDecoratorMetadata'
    url: https://www.typescriptlang.org/tsconfig/emitDecoratorMetadata.html
  - author: esbuild
    title: 'Content types: TypeScript experimental decorators'
    url: https://esbuild.github.io/content-types/#typescript
  - author: TypeORM
    title: Getting started
    url: https://typeorm.io/docs/getting-started/
verified: 2026-08-01
---

## The model

A class names what it needs, and something else decides what it gets. That inversion is the whole
idea, and Nest implements it with a container: "Nest comes with a built-in inversion of control
("IoC") container that manages the relationships between providers."

What it buys you is not shorter constructors. It is three things. One instance is shared wherever it
should be shared, because the container caches by token and hands the same object out. Wiring is
described once, in a module, rather than at every place a class is constructed. And any dependency
can be swapped without the class knowing, which is what makes a test able to inject a fake
repository into the real service.

The mechanism is where it gets interesting in TypeScript, because the container has to know the type
of every constructor parameter at runtime, and types are erased at compile time.
`emitDecoratorMetadata` is what closes that gap. With it on, the compiler emits metadata "using the
following design keys": `design:type`, `design:paramtypes` and `design:returntype`, through the
`reflect-metadata` library. `design:paramtypes` is an array of the constructor's parameter classes,
and it is the entirety of what Nest knows about what to inject.

From there the container's job is a lookup. Nest resolves the token in that array against the
providers registered in the module, then "either create[s] an instance of `CatsService`, cache[s]
it, and return[s] it, or if one is already cached, return[s] the existing instance".

TypeORM reads the same keys, which is why its getting-started page requires `emitDecoratorMetadata`
and `experimentalDecorators` in `tsconfig.json` and an `import "reflect-metadata"` somewhere global.
Nest, TypeORM, class-validator and TypeGraphQL all depend on the same emit.

## Worked example

The guard from the [auth-guard-nestjs](/workouts/auth-guard-nestjs) workout asks for a service by
naming its type:

```ts
@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(private readonly reports: ReportsService) {}
}
```

With `emitDecoratorMetadata` on, that compiles to roughly this:

```js
OwnerGuard = __decorate(
  [Injectable(), __metadata('design:paramtypes', [ReportsService])],
  OwnerGuard
);
```

That second array is the injection. Without it, the class still compiles, still imports
`ReportsService`, and still runs. Nest has an empty parameter list to work from, so `this.reports`
is `undefined` the first time the guard fires.

This repository hit exactly that. Workout workspaces run their checkpoints under vitest, whose
default transform is esbuild, and esbuild does not implement `emitDecoratorMetadata` at all: "Since
esbuild does not replicate TypeScript's type system, it does not have enough information to
implement this feature." So the scaffold transforms server tests with SWC instead:

```ts
// packages/workouts/scaffold/vitest.config.ts
swc.vite({
  jsc: {
    parser: { syntax: 'typescript', decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true },
    target: 'es2022',
  },
});
```

The client project stays on esbuild, which is faster and handles JSX. That one config split is what
makes any decorator-based stack usable in a workout.

## Traps

**"Cannot read properties of undefined", on a dependency you can see being imported.** The build
dropped the metadata. There is no error to show you, because nothing failed: the container was
handed an empty parameter list and injected nothing, and the failure surfaces later as a null
somewhere unrelated. Check the transform before you check your module. esbuild, and everything built
on it, emits no decorator metadata by design.

**It works under the Nest CLI and breaks under the test runner.** Same source, different compiler.
Any tool that swaps the TypeScript compiler for a faster one has to be told about decorators
explicitly, which for SWC means `legacyDecorator` and `decoratorMetadata` together. Turning on
`emitDecoratorMetadata` in `tsconfig.json` does nothing for a tool that never reads it.

**Nest cannot resolve an interface.** The symptom is "Nest can't resolve dependencies" naming a
parameter you thought was typed. The docs give the reason: "TypeScript types/interfaces are erased
during compilation, so Nest can't reference them at runtime. This means an interface can describe
the shape of a dependency, but it can't be used as a DI token by itself." Register the provider
under a string or `Symbol` token and ask for it with `@Inject(TOKEN)`.

**Two services that need each other, and one of them arrives undefined.** A circular dependency,
which produces the same null as a missing metadata emit but for a different reason: "Nest won't
instantiate them because all of the essential metadata won't be available". `forwardRef()` on both
sides makes it work. Whether it should exist at all is the better question, and a barrel file
importing its own directory is a common accidental cause.
