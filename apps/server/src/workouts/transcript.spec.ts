import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WorkoutManifest } from '@hone/shared';
import { afterAll, describe, expect, it } from 'vitest';

import { RUNTIME_MODULES, SCAFFOLD_DIR } from './workout-content';
import { runCheckpoints } from './workout-runner';

/**
 * A checkpoint answers yes or no, and for the ones whose subject is a shape that
 * is thin. What a suite already has is serialisable, so `hone/record.ts` writes
 * it out and the runner reads it back onto the checkpoint it belongs to.
 *
 * The fixture is written at run time rather than committed, because a checkpoint
 * suite on disk under `src/` would be collected by this package's own test run.
 */

const RECORDING_SUITE = `import { expect, it } from 'vitest';

import { record } from '../hone/record';

it('records what it saw', () => {
  record('a body', { id: '7', nested: { deep: [1, 2] } });
  record('already text', 'line one\\nline two');
  expect(1).toBe(1);
});

it('records from a failing test too', () => {
  record('the long one', 'x'.repeat(9000));
  expect(1).toBe(2);
});
`;

/** Nothing recorded, which is what almost every checkpoint in the library does. */
const SILENT_SUITE = `import { expect, it } from 'vitest';

it('says nothing', () => {
  expect(1).toBe(1);
});
`;

/**
 * Recording must not be able to decide anything. A suite that hands over
 * something unserialisable has to end where it would have ended without the
 * call, which is the whole reason the recorder swallows its own errors.
 */
const HOSTILE_SUITE = `import { expect, it } from 'vitest';

import { record } from '../hone/record';

it('passes despite handing over a value JSON cannot hold', () => {
  const circular: Record<string, unknown> = { name: 'loop' };
  circular.self = circular;
  record('circular', circular);
  record('undefined', undefined);
  record('a function', () => 1);
  expect(1).toBe(1);
});
`;

const MANIFEST = {
  checkpoints: [
    { id: 'records', title: 'Records', testFile: 'tests/records.test.ts' },
    { id: 'silent', title: 'Silent', testFile: 'tests/silent.test.ts' },
    { id: 'hostile', title: 'Hostile', testFile: 'tests/hostile.test.ts' },
  ],
} satisfies Pick<WorkoutManifest, 'checkpoints'>;

const scratch: string[] = [];

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function build(): string {
  const workspace = mkdtempSync(join(tmpdir(), 'hone-transcript-'));
  scratch.push(workspace);

  cpSync(SCAFFOLD_DIR, workspace, { recursive: true });
  mkdirSync(join(workspace, 'tests'), { recursive: true });
  writeFileSync(join(workspace, 'tests', 'records.test.ts'), RECORDING_SUITE, 'utf8');
  writeFileSync(join(workspace, 'tests', 'silent.test.ts'), SILENT_SUITE, 'utf8');
  writeFileSync(join(workspace, 'tests', 'hostile.test.ts'), HOSTILE_SUITE, 'utf8');
  symlinkSync(RUNTIME_MODULES, join(workspace, 'node_modules'), 'dir');
  return workspace;
}

describe('a checkpoint that records what it saw', () => {
  it('lands on the checkpoint that recorded it, and nowhere else', async () => {
    const run = await runCheckpoints(build(), MANIFEST);
    const records = run.checkpoints.find((result) => result.id === 'records');
    const silent = run.checkpoints.find((result) => result.id === 'silent');

    expect(run.crashed).toBeNull();
    expect(records?.transcript?.map((entry) => entry.label)).toEqual([
      'a body',
      'already text',
      'the long one',
    ]);
    // Absent rather than empty: most checkpoints record nothing, and an empty
    // array would put an empty panel on every run in the library.
    expect(silent?.transcript).toBeUndefined();
  }, 120_000);

  it('serialises a value and passes text through untouched', async () => {
    const run = await runCheckpoints(build(), MANIFEST);
    const entries = run.checkpoints.find((result) => result.id === 'records')?.transcript ?? [];

    expect(entries[0]?.body).toContain('"id": "7"');
    expect(entries[1]?.body).toBe('line one\nline two');
  }, 120_000);

  it('cuts a long one off and says so', async () => {
    const run = await runCheckpoints(build(), MANIFEST);
    const long = run.checkpoints
      .find((result) => result.id === 'records')
      ?.transcript?.find((entry) => entry.label === 'the long one');

    expect(long?.body.length).toBe(4000);
    expect(long?.truncated).toBe(true);
  }, 120_000);

  it('records from a failing test as readily as a passing one', async () => {
    const run = await runCheckpoints(build(), MANIFEST);
    const records = run.checkpoints.find((result) => result.id === 'records');

    expect(records?.status).toBe('failed');
    expect(records?.transcript?.length).toBe(3);
  }, 120_000);

  it('cannot fail a checkpoint that would otherwise pass', async () => {
    const run = await runCheckpoints(build(), MANIFEST);
    const hostile = run.checkpoints.find((result) => result.id === 'hostile');

    expect(hostile?.status).toBe('passed');
    expect(hostile?.transcript?.map((entry) => entry.label)).toEqual([
      'circular',
      'undefined',
      'a function',
    ]);
  }, 120_000);

  it('does not carry a transcript from the previous run into this one', async () => {
    const workspace = build();
    const first = await runCheckpoints(workspace, MANIFEST);
    writeFileSync(join(workspace, 'tests', 'records.test.ts'), SILENT_SUITE, 'utf8');
    const second = await runCheckpoints(workspace, MANIFEST, { previous: first });

    expect(
      second.checkpoints.find((result) => result.id === 'records')?.transcript
    ).toBeUndefined();
  }, 180_000);
});
