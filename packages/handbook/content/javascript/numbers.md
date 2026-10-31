---
title: Numbers, money, and parsing
question: Why is my total a penny out, and why did that string parse to 1?
order: 7
practise:
  - debug-float-precision
  - debug-number-money
  - debug-parseint-radix
  - debug-nan-comparison
sources:
  - author: MDN
    title: Number
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number
  - author: MDN
    title: Number.MAX_SAFE_INTEGER
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER
  - author: MDN
    title: parseInt()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/parseInt
verified: 2026-08-02
---

JavaScript stores every number in binary, and many ordinary decimal fractions have no exact binary
form. Add up a few prices and the total can come out a hair off, which reaches the invoice as a
missing penny. Reading a number out of text has its own surprise: the older parsing function reads
digits until it meets something else and quietly drops the rest, so a typo becomes a believable
wrong value.

## The model

**Every number is a double.** MDN: the `Number` type is "a double-precision 64-bit binary format IEEE
754 value, like `double` in Java or C#". Binary fractions cannot represent `0.1` exactly, the same way
decimal cannot represent a third, so `0.1` is stored as the nearest available double and the error
becomes visible when you add: `0.1 + 0.2` is `0.30000000000000004`, and the strict comparison against
`0.3` is false.

**Integers are exact, up to a point.** Whole numbers are exact up to `Number.MAX_SAFE_INTEGER`, which
is `2**53 - 1`, or `9007199254740991`. Past it the gaps between representable values are larger than
one, which is why `2**53 === 2**53 + 1` is true. That ceiling is about nine quadrillion, so it is
comfortable for counting money in pence and uncomfortable for a 64-bit id from another system, which
is why those arrive as strings.

**So money is an integer count of minor units.** Hold pence, not pounds. Addition and comparison
become exact because integers are exact, and division happens once, at the moment of display. The same
rule holds one layer down: a money column is `NUMERIC`, never `FLOAT`.

**Parsing has two functions and they disagree about junk.** `parseInt` reads as many leading digits as
it can and ignores the rest. `Number` requires the whole string to be a valid numeric literal and
gives `NaN` otherwise. Neither is the right one always; they answer different questions, and the
question for user input is usually "is this a number", which is `Number`'s.

## Worked example

Run any of this and it comes out the same way:

```js
0.1 + 0.2; // 0.30000000000000004
0.1 + 0.2 === 0.3; // false
Math.abs(0.1 + 0.2 - 0.3) < Number.EPSILON; // true — compare with a tolerance

19.99 * 100; // 1998.9999999999998  — the conversion is lossy too
Math.round(19.99 * 100); // 1999    — so round on the way in

(1.005).toFixed(2); // "1.00" — 1.005 is stored just under 1.005
```

Parsing, on the same six inputs:

```js
parseInt('12kg'); //  12    — stops at the first non-digit
parseInt('1e3'); //   1     — 'e' is not a digit in base 10
parseInt('0x10'); //  16    — the one prefix parseInt understands
parseInt('0x10', 10); // 0  — with a radix, it stops at the 'x'
Number('1e3'); //     1000  — a valid literal, so the whole thing counts
Number('12kg'); //    NaN   — not a valid literal
Number(''); //        0     — and this is the one that gets you
```

`Number('')` is `0`, and so is `Number('   ')`, `Number(null)` and `Number([])`. Validation written as
`Number(input) > 0` therefore treats an empty field as a legitimate zero rather than as missing.

## Traps

**A total drifts by a penny under repeated addition.** Floats, doing what floats do. Move to integer
minor units at the boundary where the money enters your system, not at the point where the total is
computed, because by then several roundings have already happened. Currencies with three minor digits
or none at all are why the unit belongs in the model rather than being hard-coded as a hundred.

**`toFixed` looks like rounding and is not, quite.** `(1.005).toFixed(2)` is `"1.00"`, because the
value stored for `1.005` is slightly below it. `toFixed` is a formatter for display; it is not a way
to fix arithmetic, and rounding half-up on money needs to happen on integers.

**Validation accepts a number that was never there.** `parseInt('1e3')` is `1` and `parseInt('12kg')`
is `12`, so a form field silently becomes a plausible wrong value rather than an error. Use `Number`
or the unary `+` when the whole string has to be a number, keep `parseInt` for genuinely prefixed
text, and pass the radix when you do: without one, only `0x` changes the base, but the habit costs
nothing. Then check the result with `Number.isNaN`, because `NaN !== NaN` makes `=== NaN` always
false.
