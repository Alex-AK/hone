---
title: Boolean operators that do not return booleans
question: Why did `|| 20` turn my 0 into 20, and why won't `??` sit next to `&&`?
order: 9
practise:
  - logic-and-returns-operand
  - logic-or-last-operand
  - logic-short-circuit-side-effect
  - logic-and-renders-zero
  - logic-precedence-and-over-or
  - logic-not-binds-tighter
  - logic-invert-compound
  - logic-de-morgan-code
  - logic-empty-array-truthy
  - js-nullish-vs-or
  - ts-falsy-vs-nullish
  - debug-empty-query-param
  - logic-nullish-mixing
sources:
  - author: MDN
    title: Logical AND (&&)
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_AND
  - author: MDN
    title: Nullish coalescing operator (??)
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing
  - author: MDN
    title: Operator precedence
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_precedence
  - author: TC39
    title: 'ECMAScript: Binary Logical Operators'
    url: https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-binary-logical-operators
  - author: React
    title: Conditional rendering
    url: https://react.dev/learn/conditional-rendering
verified: 2026-08-02
---

## The model

`&&`, `||` and `??` do not answer a question. They pick one of their two operands and hand it back.
The spec says it outright: "The value produced by a `&&` or `||` operator is not necessarily of type
Boolean. The value produced will always be the value of one of the two operand expressions." Only
`!` and the comparison operators give you a real boolean.

Each one tests the left operand and returns a side:

- `a || b` returns `a` when `a` is truthy, and `b` otherwise.
- `a && b` returns `a` when `a` is falsy, and `b` otherwise.
- `a ?? b` returns `a` unless `a` is `null` or `undefined`, and `b` then.

The right operand is only evaluated when the left did not settle it. MDN, on `&&`: the operator
"stops and returns the original value of that falsy operand; it does **not** evaluate any of the
remaining operands". That is short-circuiting, and it is two features wearing one hat. It is what
makes `user && user.name` safe, and it is also a place a side effect can quietly stop happening.

`??` exists because `||` asks the wrong question about defaults. Eight values are falsy: `false`,
`0`, `-0`, `0n`, `''`, `null`, `undefined` and `NaN`. Three of them are things a caller can
legitimately mean. A page size of `0`, an empty search box, a `false` toggle: `||` treats all three
as absent and overwrites them. `??` asks "is this missing" instead of "is this falsy", and MDN
defines missing as exactly two values, `null` and `undefined`.

Precedence has one rule and one refusal. The rule: `&&` binds tighter than `||`, so `a || b && c`
groups as `a || (b && c)`. The refusal: `??` has no defined precedence against either of them.
Mixing them without parentheses is a `SyntaxError`, and MDN states it flatly, that it "is not
possible to combine either the AND (`&&`) or OR operators (`||`) directly with `??`".

Inverting a compound condition flips the operator as well as the terms. `!(a && b)` is `!a || !b`,
and `!(a || b)` is `!a && !b`. Getting that backwards is the guard that lets people through: write
`!signedIn && !active` where you meant `!(signedIn && active)` and a signed-in inactive user
sails past, because only one of the two negations is true.

## Worked example

`URLSearchParams.get` returns two different kinds of missing, and each operator catches one of them.
This is the query string a form sends when someone clears two boxes:

```js
const params = new URLSearchParams('sort=&limit=');

params.get('sort'); // '' — sent, and empty
params.get('limit'); // '' — sent, and empty
params.get('page'); // null — never sent at all

const limit = params.get('limit');
limit ?? '20'; // '' — ?? fills in for null and undefined only
limit || '20'; // '20' — || fills in for every falsy value
Number(limit ?? '20'); // 0, and the table comes back empty
```

Neither operator is the right answer here, which is the point. `??` is right for `page`, which is
genuinely absent. For `limit` the empty string is a third state, and no operator encodes "sent, but
blank": that needs a real check before the fallback.

Short-circuiting, and the call that never happens:

```js
let queries = 0;
const countRows = () => {
  queries++;
  return 0;
};

const showTotal = false;
showTotal && countRows(); // false
queries; // 0 — countRows was never called
```

Precedence, as the two readings of one expression. `&&` binds tighter, so written with no
parentheses at all it is the first line below that JavaScript runs, not the second:

```js
const admin = true;
const banned = false;
const active = false;

admin || (banned && active); // true
(admin || banned) && active; // false

(null || undefined) ?? 'c'; // 'c'
```

Every line above is output from running it. This one is not, because it does not run:

```js
null || undefined ?? 'c';
// SyntaxError: Unexpected token '??'
// Nullish coalescing operator(??) requires parens when mixing with logical operators
```

## Traps

**A page size of 0 comes back as 20.** `input || 20` asked whether the input was falsy, and `0` is.
The user asked for zero rows and got the default. `??` is the operator for a default, because it
falls back only for `null` and `undefined`. The same bug hides in `''` for a search box and in
`false` for a toggle.

**`?? 20` still gets it wrong, and now the table is empty.** A cleared form field arrives as
`?limit=`, which is the string `''`, not a missing value, so `??` passes it straight through and
`Number('')` is `0`. Blank and absent are different states in a query string. Coerce and validate
what arrived, then apply the default, rather than expecting one operator to do both.

**A file stops building over a line that reads fine.** `a || b ?? c` is a `SyntaxError`, raised when
the file is parsed, so nothing in it runs, including the parts you did not touch. Parenthesise the
half you meant, and with `&&` check which half that is: `(a && b) ?? c` falls back to `c` when `a`
is nullish, while `a && (b ?? c)` returns `a`. With `||` the two groupings always agree.

**A count of 0 appears on the page as a bare 0.** `messageCount && <p>New messages</p>` returns
`messageCount` when it is `0`, not `false`, and React's own docs are blunt about the consequence:
"React will happily render `0` rather than nothing". Give `&&` a real boolean on the left,
`messageCount > 0 && ...`, and the operator has nothing but `false` to return.

**The metric stopped being recorded, and nobody changed the metric.** It was on the right of an
`&&`, and something upstream started evaluating falsy, so the call is skipped rather than made and
ignored. Short-circuiting is a control-flow construct, so an expression that has to run does not
belong to the right of one. Put it on its own line.
