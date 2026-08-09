# Write a JSON parser

`JSON.parse`, by hand. Text goes in, a JavaScript value comes out, and anything that is not JSON
throws instead of coming back wrong.

## The task

Two files, two stages. Both are yours to finish.

**`src/lib/tokenizer.ts`** turns the text into a flat list of tokens. It already skips whitespace,
emits the six structural characters, and reads `true`, `false` and `null`. Strings and numbers are
left to you. A token carries the JavaScript value it stands for, so `-3.5` becomes the number
`-3.5` and `"a\nb"` becomes the three-character string, and the parser never looks at the original
text again.

**`src/lib/parser.ts`** walks that list and builds the value. `Cursor` is written for you, along
with `parseValue` for the scalars. `parseObject` and `parseArray` are the stage: recursive
descent, one function per shape.

## The rules

**Strings** are double-quoted. Inside them, a backslash escapes one of `"` `\` `/` `b` `f` `n` `r`
`t`, or `u` followed by exactly four hex digits. A raw control character below `U+0020` is not
allowed in a string, escaped is the only way to write one.

**Numbers** are an optional minus, then an integer part, then an optional fraction, then an
optional exponent (`e` or `E`, an optional sign, at least one digit). The integer part is `0` on
its own or a non-zero digit followed by any digits, which is why `0` and `0.5` are numbers and
`01` is not.

**Anything that is not JSON has to throw**, including all of these:

- a trailing comma, in either `{"a": 1,}` or `[1,]`
- single quotes, `{'a': 1}`
- an unquoted key, `{a: 1}`
- a leading zero, `01`
- a document that stops early, `{"a":` or `"unterminated`
- an empty document
- anything after the value the document ended on, `{} junk`

## The last checkpoint

The first four hand you documents somebody chose. The last one generates them, runs `JSON.parse`
over the same text, and fails if either of you accepts something the other refuses or you disagree
on the value. It adds no rules: everything it checks is on this page already. When it fails it
prints the shortest document that disagrees, which is usually four or five characters and is a
complete test case.

## Notes

Nothing is imported here and nothing needs to be. The whole exercise is two pure functions over a
string, so a checkpoint failure is always about your code and never about a fixture.

`npm`-style commands are not available. Hit **Run checkpoints** to see where you are.

## If you finish early

- Errors say what went wrong but not where. Carry the offset onto every token and put a line and
  column in the message, then work out how much that costs on a large document.
- `JSON.parse('1e999')` answers `Infinity`, and `JSON.parse('12345678901234567890')` loses
  precision. Decide whether a parser should say so, and what it would return if it did.
- Duplicate keys are the interesting one. RFC 8259 says only that names should be unique and calls
  the behaviour of a receiver unpredictable when they are not, so `{"a": 1, "a": 2}` is legal
  input with no defined answer. Pick yours on purpose.

---

Credit: this belongs to the build-your-own-X genre, and its closest ancestor is the
[Build Your Own JSON Parser](https://codingchallenges.fyi/challenges/challenge-json-parser)
challenge by John Crickett.
