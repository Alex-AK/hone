import { rmSync } from 'node:fs';
import { join } from 'node:path';

import type { WorkoutRun } from '@hone/shared';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Runs before the imports below, which is what it takes to redirect `DATA_DIR`:
// it is read once, at import, and `start` materialises a workspace under it.
const DATA_ROOT = vi.hoisted(() => {
  const root = `${process.env.TMPDIR ?? '/tmp'}/hone-attempt-history-${String(process.pid)}`;
  process.env.HONE_DATA_DIR = root;
  return root;
});

// The clock is the subject here, not the suites. Spawning vitest per run would
// make this a test of how fast this machine is.
vi.mock('./workout-runner', () => ({ runCheckpoints: vi.fn() }));

import { CurrentUserService } from '../common/current-user.service';
import { type AppDb, openAppDatabase, runMigrations } from '../db/client';
import { seedAll } from '../seed/seed';
import { listManifests } from './workout-content';
import { runCheckpoints } from './workout-runner';
import { WorkoutsService } from './workouts.service';

const manifest = listManifests().find((entry) => entry.requires === undefined);
const SLUG = manifest?.slug ?? '';

let db: AppDb;
let sqlite: SqliteDatabase;
let workouts: WorkoutsService;

/** A whole-suite run, green or not, with no vitest anywhere near it. */
function runOf(passed: number, options: { only?: string; at?: string } = {}): WorkoutRun {
  return {
    ranAt: options.at ?? new Date().toISOString(),
    durationMs: 500,
    only: options.only ?? null,
    passedCount: passed,
    checkpoints: [],
    crashed: null,
    skipped: null,
  };
}

function green(at: string): WorkoutRun {
  return runOf(manifest?.checkpoints.length ?? 0, { at });
}

beforeEach(() => {
  sqlite?.close();
  const handle = openAppDatabase(join(DATA_ROOT, `app-${Math.random().toString(36).slice(2)}.db`));
  db = handle.db;
  sqlite = handle.sqlite;
  runMigrations(db);
  seedAll(db, join(DATA_ROOT, 'practice.db'));

  workouts = new WorkoutsService(db, new CurrentUserService());
});

afterAll(() => {
  sqlite?.close();
  rmSync(DATA_ROOT, { recursive: true, force: true });
});

/**
 * Second and third runs are the point of a workout, so the number worth keeping
 * is how long it took to go green. Nothing already on the row could answer it:
 * `last_run` is overwritten by every run, `finished_at` is when Finish was
 * pressed and the review happens after green, and `best_passed` says you got
 * there and never when.
 */
describe('attempt history', () => {
  it('is empty until an attempt has been finished', async () => {
    if (!manifest) return;
    expect((await workouts.detail(SLUG)).history).toEqual([]);

    await workouts.start(SLUG);
    // Still empty: an attempt in progress is the one on screen, not history.
    expect((await workouts.detail(SLUG)).history).toEqual([]);
  });

  it('measures from the start of the attempt to the first green run', async () => {
    if (!manifest) return;
    const started = (await workouts.start(SLUG)).attempt?.startedAt ?? '';

    vi.mocked(runCheckpoints).mockResolvedValue(green(plus(started, 754)));
    await workouts.run(SLUG);
    await workouts.finish(SLUG);

    expect((await workouts.detail(SLUG)).history[0]?.secondsToGreen).toBe(754);
  });

  it('keeps the first green run, not the last', async () => {
    if (!manifest) return;
    const started = (await workouts.start(SLUG)).attempt?.startedAt ?? '';

    vi.mocked(runCheckpoints).mockResolvedValue(green(plus(started, 100)));
    await workouts.run(SLUG);
    // Broken again and fixed again. Working out what was wrong still took 100s.
    vi.mocked(runCheckpoints).mockResolvedValue(runOf(0, { at: plus(started, 200) }));
    await workouts.run(SLUG);
    vi.mocked(runCheckpoints).mockResolvedValue(green(plus(started, 900)));
    await workouts.run(SLUG);
    await workouts.finish(SLUG);

    expect((await workouts.detail(SLUG)).history[0]?.secondsToGreen).toBe(100);
  });

  it('leaves an attempt that never went green without a time', async () => {
    if (!manifest) return;
    await workouts.start(SLUG);

    vi.mocked(runCheckpoints).mockResolvedValue(runOf(1));
    await workouts.run(SLUG);
    await workouts.finish(SLUG);

    const record = (await workouts.detail(SLUG)).history[0];
    expect(record?.secondsToGreen).toBeNull();
    expect(record?.checkpointsPassed).toBe(1);
  });

  /**
   * A one-checkpoint run carries the others forward, and carried passes are
   * somebody else's work. The same rule already governs revealing the solution.
   */
  it('does not count a single-checkpoint run that happens to total up', async () => {
    if (!manifest) return;
    const only = manifest.checkpoints[0]?.id ?? '';
    await workouts.start(SLUG);

    vi.mocked(runCheckpoints).mockResolvedValue(
      runOf(manifest.checkpoints.length, { only, at: new Date().toISOString() })
    );
    await workouts.run(SLUG, only);
    await workouts.finish(SLUG);

    expect((await workouts.detail(SLUG)).history[0]?.secondsToGreen).toBeNull();
  });

  it('reads back newest first, so a second attempt sits above the first', async () => {
    if (!manifest) return;
    vi.mocked(runCheckpoints).mockResolvedValue(runOf(0));

    await workouts.start(SLUG);
    await workouts.finish(SLUG);
    await workouts.start(SLUG);
    await workouts.finish(SLUG);

    const history = (await workouts.detail(SLUG)).history;
    expect(history).toHaveLength(2);
    expect(Date.parse(history[0]?.startedAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse(history[1]?.startedAt ?? '')
    );
  });
});

function plus(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}
