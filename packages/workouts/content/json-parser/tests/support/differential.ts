/**
 * The other four checkpoints assert on documents somebody sat down and thought
 * of. This one asserts a property over documents nobody wrote: for any text at
 * all, your parser and `JSON.parse` either both refuse it or both come back
 * with the same value.
 *
 * Two things make that worth having. The oracle is a built-in, so the property
 * costs nothing to check and cannot drift from what JSON actually is. And a
 * counterexample is shrunk before it is reported, so the failure names the
 * shortest document that still disagrees rather than the 300-character one that
 * happened to find it.
 *
 * Everything here is seeded. Nothing calls `Math.random`, so a run that fails
 * fails the same way on the next run and on someone else's machine.
 */

export type Parse = (input: string) => unknown;

/** mulberry32: small, seeded, and identical everywhere `Math.imul` is. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Awkward on purpose: the empty key, keys that need escaping, a character
 * outside the basic plane, and a control character `JSON.stringify` will emit
 * as `\u0000`.
 */
const KEYS = ['a', 'id', 'name', '', ' ', 'a b', 'a\nb', 'a"b', 'a\\b', '0', '1e3', '☃'];

const STRINGS = [
  '',
  'x',
  'hello world',
  'a\nb',
  'a\tb',
  'a\bb',
  '"quoted"',
  'back\\slash',
  'sl/ash',
  '☃',
  '😀',
  '\u0000',
  '\u001f',
  'é',
];

const NUMBERS = [0, 1, -1, 42, -42, 0.5, -0.125, 100, 1e21, 1e-7, 2 ** 53, -(2 ** 53), 1234.5678];

const LITERALS = [true, false, null];

function leaf(next: () => number): unknown {
  const roll = next();
  if (roll < 0.4) return STRINGS[Math.floor(next() * STRINGS.length)];
  if (roll < 0.8) return NUMBERS[Math.floor(next() * NUMBERS.length)];
  return LITERALS[Math.floor(next() * LITERALS.length)];
}

function generateValue(next: () => number, depth: number): unknown {
  const roll = next();
  if (depth <= 0 || roll < 0.5) return leaf(next);

  const size = Math.floor(next() * 4);
  if (roll < 0.75) {
    return Array.from({ length: size }, () => generateValue(next, depth - 1));
  }

  const object: Record<string, unknown> = {};
  for (let i = 0; i < size; i += 1) {
    object[KEYS[Math.floor(next() * KEYS.length)]] = generateValue(next, depth - 1);
  }
  return object;
}

/**
 * Four spellings of the same value, because whitespace between tokens is where
 * a tokeniser that only skips single spaces comes apart.
 */
function serialise(value: unknown, next: () => number): string {
  const roll = next();
  if (roll < 0.4) return JSON.stringify(value);
  if (roll < 0.6) return JSON.stringify(value, null, 2);
  if (roll < 0.8) return JSON.stringify(value, null, '\t');
  return ` \n\t${JSON.stringify(value)}\r\n `;
}

export function generatedDocuments(seed: number, count: number): string[] {
  const next = random(seed);
  return Array.from({ length: count }, () => serialise(generateValue(next, 4), next));
}

const NOISE = [...'{}[],:"\\ \n0.eE-+', 't', 'f', 'n', 'u', "'", '\u0000'];

/**
 * One edit to a document that was valid. Most of these produce text JSON refuses,
 * which is the half of the contract examples test worst: a parser that stops at
 * the first value accepts `{} junk`, and one that trusts the tokeniser accepts
 * `01`.
 */
export function mutatedDocuments(seed: number, count: number): string[] {
  const next = random(seed);
  const documents: string[] = [];

  while (documents.length < count) {
    const source = serialise(generateValue(next, 3), next);
    if (source.length < 2) continue;

    const at = Math.floor(next() * source.length);
    const noise = NOISE[Math.floor(next() * NOISE.length)];
    const roll = next();

    if (roll < 0.3) documents.push(source.slice(0, at) + source.slice(at + 1));
    else if (roll < 0.5) documents.push(source.slice(0, at) + source[at] + source.slice(at));
    else if (roll < 0.75) documents.push(source.slice(0, at) + noise + source.slice(at));
    else documents.push(source.slice(0, at) + noise + source.slice(at + 1));
  }

  return documents;
}

type Outcome = { threw: true; message: string } | { threw: false; value: unknown };

function run(parse: Parse, input: string): Outcome {
  try {
    return { threw: false, value: parse(input) };
  } catch (error) {
    return { threw: true, message: error instanceof Error ? error.message : String(error) };
  }
}

type Difference = { path: string; expected: unknown; actual: unknown };

/**
 * The first place two values part company, named by path, because
 * "they are not equal" is not a lead and `a.0.name` is.
 */
function firstDifference(expected: unknown, actual: unknown, path = ''): Difference | null {
  const here = (): Difference => ({ path: path || 'the whole document', expected, actual });

  if (expected === null || actual === null || typeof expected !== 'object') {
    return Object.is(expected, actual) ? null : here();
  }
  if (typeof actual !== 'object') return here();

  if (Array.isArray(expected) !== Array.isArray(actual)) return here();

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return here();
    for (let i = 0; i < expected.length; i += 1) {
      const inner = firstDifference(expected[i], actual[i], path ? `${path}.${i}` : String(i));
      if (inner) return inner;
    }
    return null;
  }

  const left = expected as Record<string, unknown>;
  const right = actual as Record<string, unknown>;
  // Key order is not part of the contract; which keys survived is.
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];

  for (const key of keys) {
    const inHand = Object.prototype.hasOwnProperty.call(left, key);
    const inYours = Object.prototype.hasOwnProperty.call(right, key);
    const at = path ? `${path}.${key}` : key;
    if (inHand !== inYours) {
      return {
        path: at,
        expected: inHand ? left[key] : '(no such key)',
        actual: inYours ? right[key] : '(no such key)',
      };
    }
    const inner = firstDifference(left[key], right[key], at);
    if (inner) return inner;
  }

  return null;
}

function disagrees(parse: Parse, input: string): boolean {
  const oracle = run(JSON.parse, input);
  const yours = run(parse, input);

  if (oracle.threw !== yours.threw) return true;
  if (oracle.threw || yours.threw) return false;
  return firstDifference(oracle.value, yours.value) !== null;
}

/**
 * Delta debugging over the text: cut the largest block that keeps the
 * disagreement, then halve the block and go again. Every accepted cut shortens
 * the document, so this terminates on its own; the budget is there for a parser
 * that hangs rather than for this loop.
 */
function shrink(input: string, fails: (candidate: string) => boolean): string {
  let best = input;
  let budget = 2000;

  for (let block = Math.max(1, best.length >> 1); block >= 1; block >>= 1) {
    let start = 0;
    while (start + block <= best.length && budget > 0) {
      budget -= 1;
      const candidate = best.slice(0, start) + best.slice(start + block);
      if (fails(candidate)) best = candidate;
      else start += 1;
    }
  }

  return best;
}

function show(value: unknown): string {
  if (value === undefined) return 'undefined';
  const printed = JSON.stringify(value);
  return printed === undefined ? String(value) : printed;
}

/**
 * The report is the whole point of the checkpoint: a shrunk document, what each
 * side did with it, and where they parted company.
 */
function report(parse: Parse, input: string): string {
  const document = shrink(input, (candidate) => disagrees(parse, candidate));
  const oracle = run(JSON.parse, document);
  const yours = run(parse, document);

  const lines = [
    'Your parser and JSON.parse disagree on this document:',
    '',
    `  ${JSON.stringify(document)}`,
    '',
  ];

  if (oracle.threw && !yours.threw) {
    lines.push(
      '  JSON.parse   refused it',
      `  your parse   returned ${show((yours as { value: unknown }).value)}`,
      '',
      '  This is not JSON, and a parser that answers anyway is worse than one that throws.'
    );
  } else if (!oracle.threw && yours.threw) {
    lines.push(
      `  JSON.parse   returned ${show((oracle as { value: unknown }).value)}`,
      `  your parse   threw ${JSON.stringify((yours as { message: string }).message)}`
    );
  } else if (!oracle.threw && !yours.threw) {
    const expected = (oracle as { value: unknown }).value;
    const actual = (yours as { value: unknown }).value;
    const difference = firstDifference(expected, actual);
    lines.push(
      `  JSON.parse   ${show(expected)}`,
      `  your parse   ${show(actual)}`,
      '',
      `  first difference at ${difference?.path ?? 'the whole document'}: ` +
        `expected ${show(difference?.expected)}, got ${show(difference?.actual)}`
    );
  }

  return lines.join('\n');
}

/**
 * Walks the documents and returns a report for the first disagreement, or null
 * when the property held for every one of them.
 */
export function firstDisagreement(parse: Parse, documents: readonly string[]): string | null {
  for (const document of documents) {
    if (disagrees(parse, document)) return report(parse, document);
  }
  return null;
}
