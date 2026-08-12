import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database as SqliteDatabase } from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { type AppDb, openAppDatabase, runMigrations } from '../db/client';
import {
  attempts,
  problemProgress,
  problems,
  sessionItems,
  sessions,
  users,
  workoutAttempts,
} from '../db/schema';
import { exportProgress, importProgress, parseExport } from './transfer';

const dir = mkdtempSync(join(tmpdir(), 'hone-transfer-'));
const USER = 1;
const SLUGS = ['js-find', 'sql-select-genre', 'react-keys'];

interface Machine {
  db: AppDb;
  sqlite: SqliteDatabase;
  /** Slug → this machine's own problem id. */
  ids: Map<string, number>;
}

const open = (() => {
  let counter = 0;
  /**
   * `startId` is the whole point of the fixture: two machines that seeded at
   * different times hold different ids for the same slug, so every test here
   * runs across a deliberate offset.
   */
  return (startId: number): Machine => {
    counter += 1;
    const { db, sqlite } = openAppDatabase(join(dir, `m${counter}.db`));
    runMigrations(db);
    db.insert(users).values({ id: USER, name: 'Local' }).run();
    const ids = new Map<string, number>();
    SLUGS.forEach((slug, index) => {
      const id = startId + index;
      db.insert(problems)
        .values({
          id,
          slug,
          title: slug,
          category: 'js-apis',
          difficulty: 'easy',
          relevance: 'daily',
          type: 'short-text',
          position: index,
          prompt: 'p',
          graderConfig: '{}',
          solution: 's',
          explanation: 'e',
        })
        .run();
      ids.set(slug, id);
    });
    return { db, sqlite, ids };
  };
})();

function solve(machine: Machine, slug: string, at: string, answer = 'right'): void {
  const problemId = machine.ids.get(slug) ?? 0;
  machine.db
    .insert(attempts)
    .values({ userId: USER, problemId, answer, verdict: 'correct', createdAt: at })
    .run();
  machine.db
    .insert(problemProgress)
    .values({
      userId: USER,
      problemId,
      status: 'solved',
      attemptsCount: 1,
      solvedAt: at,
      lastSeenAt: at,
      reviewStep: 1,
      reviewCount: 1,
    })
    .onConflictDoUpdate({
      target: [problemProgress.userId, problemProgress.problemId],
      set: { status: 'solved', solvedAt: at, lastSeenAt: at },
    })
    .run();
}

function progressOf(machine: Machine, slug: string) {
  const [row] = machine.db
    .select()
    .from(problemProgress)
    .where(
      and(
        eq(problemProgress.userId, USER),
        eq(problemProgress.problemId, machine.ids.get(slug) ?? 0)
      )
    )
    .all();
  return row;
}

function attemptsOf(machine: Machine, slug: string) {
  return machine.db
    .select()
    .from(attempts)
    .where(and(eq(attempts.userId, USER), eq(attempts.problemId, machine.ids.get(slug) ?? 0)))
    .all();
}

const transfer = (from: Machine, to: Machine) =>
  importProgress(to.db, USER, parseExport(JSON.stringify(exportProgress(from.db, USER, 'now'))));

let work: Machine;
let personal: Machine;

beforeEach(() => {
  work = open(1);
  personal = open(500);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('progress transfer', () => {
  it('lands on the right problem when the two machines number them differently', () => {
    expect(work.ids.get('js-find')).not.toBe(personal.ids.get('js-find'));
    solve(work, 'js-find', '2026-08-01T09:00:00Z');

    transfer(work, personal);

    expect(progressOf(personal, 'js-find')?.status).toBe('solved');
    // The id `js-find` had on the work machine belongs to nothing here, and
    // nothing else must have been touched.
    expect(progressOf(personal, 'sql-select-genre')).toBeUndefined();
    expect(progressOf(personal, 'react-keys')).toBeUndefined();
  });

  it('keeps work the receiving machine did on its own', () => {
    solve(work, 'js-find', '2026-08-01T09:00:00Z');
    solve(personal, 'react-keys', '2026-08-02T09:00:00Z');

    transfer(work, personal);

    expect(progressOf(personal, 'js-find')?.status).toBe('solved');
    expect(progressOf(personal, 'react-keys')?.status).toBe('solved');
  });

  it('adds nothing the second time the same file is imported', () => {
    solve(work, 'js-find', '2026-08-01T09:00:00Z');
    transfer(work, personal);

    const second = transfer(work, personal);

    expect(second.attemptsAdded).toBe(0);
    expect(second.sessionsAdded).toBe(0);
    expect(second.workoutsAdded).toBe(0);
    expect(attemptsOf(personal, 'js-find')).toHaveLength(1);
  });

  it('unions the attempt log and recomputes the count from it', () => {
    solve(work, 'js-find', '2026-08-01T09:00:00Z', 'from work');
    solve(personal, 'js-find', '2026-08-02T09:00:00Z', 'from personal');

    transfer(work, personal);

    expect(attemptsOf(personal, 'js-find')).toHaveLength(2);
    // Neither side's own counter said 2; only the merged log does.
    expect(progressOf(personal, 'js-find')?.attemptsCount).toBe(2);
  });

  it('takes the review ladder from whichever machine saw it last', () => {
    solve(work, 'js-find', '2026-08-05T09:00:00Z');
    work.db
      .update(problemProgress)
      .set({ reviewStep: 4, reviewCount: 4, dueAt: '2026-09-01T00:00:00Z' })
      .where(eq(problemProgress.problemId, work.ids.get('js-find') ?? 0))
      .run();
    solve(personal, 'js-find', '2026-08-01T09:00:00Z');

    transfer(work, personal);

    const merged = progressOf(personal, 'js-find');
    expect(merged?.reviewStep).toBe(4);
    expect(merged?.dueAt).toBe('2026-09-01T00:00:00Z');
  });

  it('does not let an older file walk the ladder backwards', () => {
    solve(work, 'js-find', '2026-08-01T09:00:00Z');
    solve(personal, 'js-find', '2026-08-09T09:00:00Z');
    personal.db
      .update(problemProgress)
      .set({ reviewStep: 3, reviewCount: 3 })
      .where(eq(problemProgress.problemId, personal.ids.get('js-find') ?? 0))
      .run();

    transfer(work, personal);

    expect(progressOf(personal, 'js-find')?.reviewStep).toBe(3);
  });

  it('keeps the larger of the counters that cannot be reconstructed', () => {
    solve(work, 'js-find', '2026-08-05T09:00:00Z');
    work.db
      .update(problemProgress)
      .set({ hintsRevealed: 3, solutionViewed: 1 })
      .where(eq(problemProgress.problemId, work.ids.get('js-find') ?? 0))
      .run();
    solve(personal, 'js-find', '2026-08-09T09:00:00Z');

    transfer(work, personal);

    const merged = progressOf(personal, 'js-find');
    // The ladder came from the personal machine; the hints did not.
    expect(merged?.hintsRevealed).toBe(3);
    expect(merged?.solutionViewed).toBe(1);
  });

  it('carries sessions across with their items remapped, and skips ones already here', () => {
    const [inserted] = work.db
      .insert(sessions)
      .values({ userId: USER, createdAt: '2026-08-01T09:00:00Z', mode: 'all' })
      .returning({ id: sessions.id })
      .all();
    work.db
      .insert(sessionItems)
      .values({
        sessionId: inserted?.id ?? 0,
        problemId: work.ids.get('js-find') ?? 0,
        position: 0,
      })
      .run();

    const first = transfer(work, personal);
    expect(first.sessionsAdded).toBe(1);

    const items = personal.db.select().from(sessionItems).all();
    expect(items).toHaveLength(1);
    expect(items[0]?.problemId).toBe(personal.ids.get('js-find'));

    expect(transfer(work, personal).sessionsSkipped).toBe(1);
  });

  it('carries workout attempts, which were already keyed by slug', () => {
    work.db
      .insert(workoutAttempts)
      .values({
        userId: USER,
        slug: 'alert-feed-sqlite',
        startedAt: '2026-08-01T09:00:00Z',
        bestPassed: 3,
      })
      .run();

    expect(transfer(work, personal).workoutsAdded).toBe(1);
    expect(personal.db.select().from(workoutAttempts).all()[0]?.bestPassed).toBe(3);
    expect(transfer(work, personal).workoutsAdded).toBe(0);
  });

  it('names the slugs the receiving machine does not have rather than dropping them', () => {
    solve(work, 'js-find', '2026-08-01T09:00:00Z');
    personal.db.delete(problems).where(eq(problems.slug, 'js-find')).run();

    const report = transfer(work, personal);

    expect(report.unknownSlugs).toEqual(['js-find']);
    expect(report.progressInserted).toBe(0);
  });

  it('refuses a file that is not a progress export', () => {
    expect(() => parseExport('nonsense')).toThrow(/valid JSON/);
    expect(() => parseExport('{"hone":"something-else"}')).toThrow(/not a Hone progress export/);
    expect(() => parseExport('{"hone":"progress","version":99}')).toThrow(/version 99/);
  });
});
