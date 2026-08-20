import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';

/**
 * Hand the run report something the checkpoint saw, so a verdict about a shape
 * can be read against the shape itself. A path like `columns.0.cards.3.updatedAt`
 * names one line of a payload nobody could otherwise look at.
 *
 * **This is a transcript, not a preview.** What goes in is already serialised or
 * gets serialised here, and what comes out is text in a panel. Nothing is
 * re-executed, re-rendered or re-hydrated on the way, which is what keeps the
 * feature one file rather than a second runtime.
 *
 * Recording never decides anything. It cannot fail a checkpoint that would have
 * passed, and it cannot pass one that would have failed: every error here is
 * swallowed, because a suite that goes red over its own diagnostics is worse
 * than one that prints nothing.
 */
export function record(label: string, value: unknown): void {
  try {
    const testPath = expect.getState().testPath;
    if (!testPath) return;

    const full = typeof value === 'string' ? value : stringify(value);
    const body = full.slice(0, MAX_CHARS);

    const dir = join(process.cwd(), TRANSCRIPT_DIR);
    mkdirSync(dir, { recursive: true });
    // One file per process: vitest runs suites in parallel workers, and two of
    // them appending to a shared file is how a half-written line gets read back.
    appendFileSync(
      join(dir, `${String(process.pid)}.jsonl`),
      `${JSON.stringify({ testPath, label, body, truncated: full.length > MAX_CHARS })}\n`,
      'utf8'
    );
  } catch {
    // Deliberately silent. See above.
  }
}

/** Read by the runner, which empties it before every run. */
export const TRANSCRIPT_DIR = '.transcript';

/**
 * Enough of a payload to find the field the checkpoint named, and not so much
 * that it stops being readable or that a run's worth of them is worth storing.
 */
const MAX_CHARS = 4000;

function stringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    // `undefined` for undefined, a function or a symbol, which is a value worth
    // showing rather than a record worth dropping.
    return (
      JSON.stringify(
        value,
        (_key, entry: unknown) => {
          if (typeof entry === 'bigint') return `${entry.toString()}n`;
          if (entry instanceof Map) return Object.fromEntries(entry);
          if (entry instanceof Set) return [...entry];
          if (typeof entry === 'object' && entry !== null) {
            if (seen.has(entry)) return '[circular]';
            seen.add(entry);
          }
          return entry;
        },
        2
      ) ?? String(value)
    );
  } catch {
    return String(value);
  }
}
