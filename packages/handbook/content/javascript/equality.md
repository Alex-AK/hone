---
title: Equality
question: Why does my NaN check never fire, and which equality should I be using?
order: 3
practise:
  - debug-nan-comparison
  - debug-equality-coercion
  - js-samevaluezero-includes
  - js-negative-zero
  - code-deep-equal
  - react-state-object-mutation
sources:
  - author: MDN
    title: Equality comparisons and sameness
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Equality_comparisons_and_sameness
  - author: MDN
    title: Object.is()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
  - author: TC39
    title: 'ECMAScript: SameValueZero'
    url: https://tc39.es/ecma262/multipage/abstract-operations.html#sec-samevaluezero
  - author: React
    title: useState
    url: https://react.dev/reference/react/useState
verified: 2026-08-01
---

Asking whether two values are equal sounds like one question, and JavaScript has several answers to
it. They agree almost all the time and part ways on a few odd values, such as the special
not-a-number value, which is not even equal to itself. None of them looks inside two objects to
compare what they hold.

## The model

There are four equality algorithms, and MDN names them: `IsLooselyEqual` is `==`, `IsStrictlyEqual`
is `===`, `SameValue` is `Object.is`, and `SameValueZero` has no operator at all.

Start with what they agree on. For objects, all four ask one question: are these the same reference?
None of them looks inside, so no choice of operator will make two identical-looking objects equal.

They differ on three things, and only three:

| Algorithm       | Converts types | `NaN` equals `NaN` | `-0` equals `0` |
| --------------- | -------------- | ------------------ | --------------- |
| `==`            | yes            | no                 | yes             |
| `===`           | no             | no                 | yes             |
| `Object.is`     | no             | yes                | no              |
| `SameValueZero` | no             | yes                | yes             |

`SameValueZero` is the one you use without naming it. MDN: it "is used by `Array.prototype.includes()`,
`TypedArray.prototype.includes()`, as well as `Map` and `Set` methods for comparing key equality". It
is the reason a `Set` deduplicates `NaN` while `indexOf` cannot find one.

The `NaN` rule is inherited, not invented: `==` and `===` "handle `NaN`, `-0`, and `+0` specially to
conform to IEEE 754". `NaN` is not equal to itself, so no comparison can ever locate it and
`Number.isNaN(x)` is the test that works.

`-0` is a genuine value that is very good at hiding. It compares equal to `0` under `===`, prints as
`0`, and serialises as `0`, so the usual way you meet it is a division that comes out as `-Infinity`.

The default is `===`. Reach for `Object.is` when `NaN` or `-0` is the actual question, which is also
why it turns up inside framework internals: React skips a re-render when the next state is
`Object.is`-equal to the current one. Keep exactly one use of `==`: `x == null`, which matches `null`
and `undefined` and nothing else.

## Worked example

```js
const readings = [NaN, 0, -0];

NaN === NaN; // false
Object.is(NaN, NaN); // true
readings.includes(NaN); // true, includes uses SameValueZero
readings.indexOf(NaN); // -1, indexOf uses ===

0 === -0; // true
Object.is(0, -0); // false
new Set([0, -0]).size; // 1, SameValueZero again
1 / -0; // -Infinity
```

Two methods on the same array, one line apart, disagreeing about whether it contains `NaN`. Neither
is wrong; they were specified against different algorithms.

## Traps

**The branch that never runs.** `if (n === NaN)` is false for every value of `n`, including `NaN`.
`Number.isNaN(n)` is the check. Avoid the older global `isNaN`, which converts first: `isNaN('hello')`
is true and `isNaN('')` is false, which is rarely what anyone meant. `Number.isFinite(n)` is usually
the better validation, since it rejects the infinities too.

**`indexOf` cannot find a value that is definitely in the array.** The value is `NaN`, `indexOf`
compares with `===`, and `===` never matches it. `includes` uses `SameValueZero` and finds it, and so
does `findIndex((x) => Number.isNaN(x))` when you need the position.

**A total that prints as 0 and divides as `-Infinity`.** Something produced `-0`, probably a
multiplication or a rounding of a small negative number. It survives `===`, `String()` and
`JSON.stringify` untouched, so `Object.is(total, -0)` is the only direct check.

**The comparison that agrees with itself and not with the `if`.** `'0' == false` is true, because `==`
converts both sides to numbers, while `if ('0')` runs, because a non-empty string is truthy. Loose
equality and truthiness are two different questions, and asking one while thinking of the other is
what makes `==` worth avoiding.
