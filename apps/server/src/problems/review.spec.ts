import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REVIEW_INTERVALS_DAYS } from '@hone/shared';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { CurrentUserService } from '../common/current-user.service';
import { type AppDb, openAppDatabase, runMigrations } from '../db/client';
import { attempts, problemProgress, problems } from '../db/schema';
import { ProgressService } from '../progress/progress.service';
import { openPracticeDatabase } from '../seed/practice-db';
import { problemSeeds } from '../seed/problems.seed';
import { seedAll } from '../seed/seed';
import { SessionsService } from '../sessions/sessions.service';
import { ProblemsService } from './problems.service';

const dir = mkdtempSync(join(tmpdir(), 'hone-review-'));
const practicePath = join(dir, 'practice.db');

let db: AppDb;
let sqlite: SqliteDatabase;
let practiceDb: SqliteDatabase;
let service: ProblemsService;
let progress: ProgressService;
let sessions: SessionsService;

const SLUG = 'js-find';
const answerFor = (slug: string): string =>
  problemSeeds.find((seed) => seed.slug === slug)?.canonicalAnswer ?? '';

/** Read the raw scheduling columns for a slug. */
function scheduleOf(slug: string): {
  dueAt: string | null;
  reviewStep: number;
  reviewCount: number;
} {
  const [problem] = db
    .select({ id: problems.id })
    .from(problems)
    .where(eq(problems.slug, slug))
    .all();
  const [row] = db
    .select({
      dueAt: problemProgress.dueAt,
      reviewStep: problemProgress.reviewStep,
      reviewCount: problemProgress.reviewCount,
    })
    .from(problemProgress)
    .where(and(eq(problemProgress.problemId, problem?.id ?? 0), eq(problemProgress.userId, 1)))
    .all();
  return row ?? { dueAt: null, reviewStep: 0, reviewCount: 0 };
}

/** The rung recorded against each answer for a slug, oldest first. */
function rungsOf(slug: string): (number | null)[] {
  const [problem] = db
    .select({ id: problems.id })
    .from(problems)
    .where(eq(problems.slug, slug))
    .all();
  return db
    .select({ reviewStep: attempts.reviewStep })
    .from(attempts)
    .where(and(eq(attempts.problemId, problem?.id ?? 0), eq(attempts.userId, 1)))
    .orderBy(attempts.id)
    .all()
    .map((row) => row.reviewStep);
}

/** Pull a problem's review date into the past so it is due now. */
function makeDue(slug: string): void {
  const [problem] = db
    .select({ id: problems.id })
    .from(problems)
    .where(eq(problems.slug, slug))
    .all();
  db.update(problemProgress)
    .set({ dueAt: new Date(Date.now() - 60_000).toISOString() })
    .where(and(eq(problemProgress.problemId, problem?.id ?? 0), eq(problemProgress.userId, 1)))
    .run();
}

const daysFromNow = (iso: string | null): number =>
  iso === null ? -1 : Math.round((Date.parse(iso) - Date.now()) / 86_400_000);

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
  service = new ProblemsService(db, practiceDb, currentUser);
  progress = new ProgressService(db, currentUser);
  sessions = new SessionsService(db, currentUser, service);
});

afterAll(() => {
  sqlite?.close();
  practiceDb?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('spaced repetition', () => {
  it('schedules the first review one day after solving', async () => {
    await service.submitAttempt(SLUG, answerFor(SLUG));
    const schedule = scheduleOf(SLUG);
    expect(daysFromNow(schedule.dueAt)).toBe(REVIEW_INTERVALS_DAYS[0]);
    expect(schedule.reviewStep).toBe(0);
    expect(schedule.reviewCount).toBe(0);
  });

  it('widens the interval with each successful review', async () => {
    await service.submitAttempt(SLUG, answerFor(SLUG));

    for (let step = 1; step < REVIEW_INTERVALS_DAYS.length; step += 1) {
      makeDue(SLUG);
      await service.submitAttempt(SLUG, answerFor(SLUG));
      expect(scheduleOf(SLUG).reviewStep, `step ${step}`).toBe(step);
      expect(daysFromNow(scheduleOf(SLUG).dueAt), `step ${step}`).toBe(REVIEW_INTERVALS_DAYS[step]);
    }
  });

  it('stops widening at the top of the ladder', async () => {
    await service.submitAttempt(SLUG, answerFor(SLUG));
    for (let i = 0; i < REVIEW_INTERVALS_DAYS.length + 3; i += 1) {
      makeDue(SLUG);
      await service.submitAttempt(SLUG, answerFor(SLUG));
    }
    const top = REVIEW_INTERVALS_DAYS.length - 1;
    expect(scheduleOf(SLUG).reviewStep).toBe(top);
    expect(daysFromNow(scheduleOf(SLUG).dueAt)).toBe(REVIEW_INTERVALS_DAYS[top]);
  });

  it('drops back to the first rung when a review is failed', async () => {
    await service.submitAttempt(SLUG, answerFor(SLUG));
    makeDue(SLUG);
    await service.submitAttempt(SLUG, answerFor(SLUG));
    expect(scheduleOf(SLUG).reviewStep).toBe(1);

    makeDue(SLUG);
    await service.submitAttempt(SLUG, 'filter');
    expect(scheduleOf(SLUG).reviewStep, 'a failed review resets the ladder').toBe(0);
    expect(daysFromNow(scheduleOf(SLUG).dueAt)).toBe(REVIEW_INTERVALS_DAYS[0]);
  });

  it('records the rung each answer was given at, and a first pass as no rung', async () => {
    await service.submitAttempt(SLUG, 'filter');
    await service.submitAttempt(SLUG, answerFor(SLUG));
    makeDue(SLUG);
    await service.submitAttempt(SLUG, answerFor(SLUG));
    makeDue(SLUG);
    await service.submitAttempt(SLUG, 'filter');

    expect(rungsOf(SLUG)).toEqual([null, null, 0, 1]);
    // The whole reason the column exists: the answer keeps the rung it was
    // given at, where the ladder has already thrown that rung away.
    expect(scheduleOf(SLUG).reviewStep).toBe(0);
  });

  it('keeps a problem solved even when a review is failed', async () => {
    await service.submitAttempt(SLUG, answerFor(SLUG));
    makeDue(SLUG);
    const result = await service.submitAttempt(SLUG, 'filter');
    expect(result.verdict).toBe('close');
    expect(result.status, 'solved is sticky').toBe('solved');
  });

  it('counts a wrong first attempt without scheduling anything', async () => {
    await service.submitAttempt(SLUG, 'filter');
    expect(scheduleOf(SLUG).dueAt).toBeNull();
  });
});

describe('due queue', () => {
  it('is empty until a review comes round', async () => {
    await service.submitAttempt(SLUG, answerFor(SLUG));
    expect(service.next(undefined, 'next', { mode: 'due' })).toBeNull();
    expect(progress.summary().due).toBe(0);
  });

  it('serves a solved problem once it is due', async () => {
    await service.submitAttempt(SLUG, answerFor(SLUG));
    makeDue(SLUG);

    expect(service.next(undefined, 'next', { mode: 'due' })?.slug).toBe(SLUG);
    expect(progress.summary().due).toBe(1);
  });

  it('never serves unsolved problems', async () => {
    await service.submitAttempt(SLUG, 'filter');
    expect(service.next(undefined, 'next', { mode: 'due' })).toBeNull();
  });

  it('orders the most overdue first', async () => {
    const second = 'js-dedupe';
    await service.submitAttempt(SLUG, answerFor(SLUG));
    await service.submitAttempt(second, answerFor(second));
    makeDue(second);
    makeDue(SLUG);

    const head = service.next(undefined, 'next', { mode: 'due' });
    expect([SLUG, second]).toContain(head?.slug);
    expect(head?.queueSize).toBe(2);
  });

  it('leaves the due queue after a successful review', async () => {
    await service.submitAttempt(SLUG, answerFor(SLUG));
    makeDue(SLUG);
    expect(progress.summary().due).toBe(1);

    await service.submitAttempt(SLUG, answerFor(SLUG));
    expect(progress.summary().due).toBe(0);
  });

  /**
   * `dsa-patterns` opts out of being dealt, not out of the ladder. Solving one
   * is a rep you chose, so its review comes round with everything else.
   */
  it('serves a solved rep from an opt-in category', async () => {
    const dsa = 'dsa-merge-sorted';
    await service.submitAttempt(dsa, answerFor(dsa));
    makeDue(dsa);

    expect(service.next(undefined, 'next', { mode: 'due' })?.slug).toBe(dsa);
    expect(progress.summary().due).toBe(1);
  });

  it('is cleared by resetting the problem', async () => {
    await service.submitAttempt(SLUG, answerFor(SLUG));
    makeDue(SLUG);
    service.reset(SLUG);
    expect(scheduleOf(SLUG).dueAt).toBeNull();
    expect(progress.summary().due).toBe(0);
  });
});

describe('sessions and reviews', () => {
  it('puts due reviews at the front of a new session', async () => {
    const review = 'js-dedupe';
    await service.submitAttempt(review, answerFor(review));
    makeDue(review);

    const session = sessions.create({ size: 5 });
    expect(session.items[0]?.slug, 'reviews come before new material').toBe(review);
    expect(session.total).toBe(5);
  });

  it('fills the rest of the session with new problems', async () => {
    const review = 'js-dedupe';
    await service.submitAttempt(review, answerFor(review));
    makeDue(review);

    const session = sessions.create({ size: 4 });
    const slugs = session.items.map((item) => item.slug);
    expect(new Set(slugs).size, 'no duplicates between the review and new lanes').toBe(4);
  });

  /**
   * Hints are earned per attempt, not owned for good. A review that opens with
   * last month's hints already showing is not a review, it is a reading.
   */
  it('hides the hints you earned last time when the review comes round', async () => {
    await service.submitAttempt(SLUG, 'definitely wrong');
    expect(service.detail(SLUG).revealedHints.length, 'a wrong answer unlocks one').toBe(1);

    await service.submitAttempt(SLUG, answerFor(SLUG));
    makeDue(SLUG);

    expect(service.detail(SLUG).revealedHints, 'the review starts clean').toEqual([]);
  });

  it('re-earns a hint by getting the review wrong, and keeps it across reloads', async () => {
    await service.submitAttempt(SLUG, 'definitely wrong');
    await service.submitAttempt(SLUG, answerFor(SLUG));
    makeDue(SLUG);

    await service.submitAttempt(SLUG, 'wrong again');
    expect(service.detail(SLUG).revealedHints.length).toBe(1);
    // `solved` is sticky, so a naive "clear on open if solved" would wipe this
    // on the next page load.
    expect(service.detail(SLUG).revealedHints.length, 'still there on reload').toBe(1);
  });

  it('still shows the hints you had on the answer that solved it', async () => {
    await service.submitAttempt(SLUG, 'definitely wrong');
    const solvedAttempt = await service.submitAttempt(SLUG, answerFor(SLUG));

    expect(solvedAttempt.verdict).toBe('correct');
    expect(solvedAttempt.revealedHints.length, 'the panel does not blank on success').toBe(1);
  });

  it('leaves the hints alone on a problem you have not solved yet', async () => {
    const unsolved = 'js-dedupe';
    await service.submitAttempt(unsolved, 'definitely wrong');
    expect(service.detail(unsolved).revealedHints.length).toBe(1);

    // Coming back to something you never got is not a review, and the hint was
    // already paid for.
    expect(service.detail(unsolved).revealedHints.length).toBe(1);
  });

  it('marks a completed review as done within the session', async () => {
    const review = 'js-dedupe';
    await service.submitAttempt(review, answerFor(review));
    makeDue(review);

    const session = sessions.create({ size: 3 });
    await service.submitAttempt(review, answerFor(review));

    const after = sessions.active();
    expect(after?.items.find((item) => item.slug === review)?.status).toBe('solved');
    expect(after?.id).toBe(session.id);
  });
});
