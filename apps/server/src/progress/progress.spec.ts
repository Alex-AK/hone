import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database as SqliteDatabase } from 'better-sqlite3';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { CurrentUserService } from '../common/current-user.service';
import { type AppDb, openAppDatabase, runMigrations } from '../db/client';
import { attempts, workoutAttempts } from '../db/schema';
import { ProblemsService } from '../problems/problems.service';
import { openPracticeDatabase } from '../seed/practice-db';
import { problemSeeds } from '../seed/problems.seed';
import { seedAll } from '../seed/seed';
import { ProgressService } from './progress.service';

const dir = mkdtempSync(join(tmpdir(), 'hone-progress-'));
const practicePath = join(dir, 'practice.db');

let db: AppDb;
let sqlite: SqliteDatabase;
let practiceDb: SqliteDatabase;
let problemsService: ProblemsService;
let progress: ProgressService;

const SLUG = 'js-find';
const answer = problemSeeds.find((seed) => seed.slug === SLUG)?.canonicalAnswer ?? '';

beforeEach(() => {
  sqlite?.close();
  practiceDb?.close();

  const handle = openAppDatabase(join(dir, `app-${Math.random().toString(36).slice(2)}.db`));
  db = handle.db;
  sqlite = handle.sqlite;
  runMigrations(db);
  seedAll(db, practicePath);
  practiceDb = openPracticeDatabase(practicePath);

  const currentUser = new CurrentUserService();
  problemsService = new ProblemsService(db, practiceDb, currentUser);
  progress = new ProgressService(db, currentUser);
});

afterAll(() => {
  sqlite?.close();
  practiceDb?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('lastPracticedAt', () => {
  it('is null before anything has been practised', () => {
    expect(progress.summary().lastPracticedAt).toBeNull();
  });

  it('is the time of the latest answered rep', async () => {
    await problemsService.submitAttempt(SLUG, answer);

    const [attempt] = db.select({ createdAt: attempts.createdAt }).from(attempts).all();
    expect(progress.summary().lastPracticedAt).toBe(attempt?.createdAt);
  });

  it('moves to a workout run that came after the last rep', async () => {
    await problemsService.submitAttempt(SLUG, answer);
    const ranAt = new Date(Date.now() + 60_000).toISOString();
    db.insert(workoutAttempts)
      .values({
        userId: 1,
        slug: 'autocomplete-react',
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        lastRun: JSON.stringify({ ranAt }),
      })
      .run();

    expect(progress.summary().lastPracticedAt).toBe(ranAt);
  });
});
