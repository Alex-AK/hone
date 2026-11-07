import {
  CATEGORIES,
  type CategoryProgress,
  DIFFICULTIES,
  type DifficultyProgress,
  type ProgressResponse,
  type RecentAttempt,
  type ResetAllResponse,
  type TagProgress,
  TAGS,
} from '@hone/shared';
import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import { CurrentUserService } from '../common/current-user.service';
import { parseTags } from '../common/tags';
import type { AppDb } from '../db/client';
import { APP_DB } from '../db/db.module';
import {
  attempts,
  problemProgress,
  problems,
  sessionItems,
  sessions,
  workoutAttempts,
} from '../db/schema';
import { lastRunAt } from './progress.utils';

const RECENT_ATTEMPT_LIMIT = 10;

@Injectable()
export class ProgressService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDb,
    private readonly currentUser: CurrentUserService
  ) {}

  summary(): ProgressResponse {
    const userId = this.currentUser.getUserId();

    const allProblems = this.db
      .select({
        id: problems.id,
        category: problems.category,
        difficulty: problems.difficulty,
        tags: problems.tags,
      })
      .from(problems)
      .all();

    const progressRows = this.db
      .select({
        problemId: problemProgress.problemId,
        status: problemProgress.status,
        attemptsCount: problemProgress.attemptsCount,
        dueAt: problemProgress.dueAt,
      })
      .from(problemProgress)
      .where(eq(problemProgress.userId, userId))
      .all();
    const solvedIds = new Set(
      progressRows.filter((row) => row.status === 'solved').map((row) => row.problemId)
    );
    // "Missed" is anything you engaged with and did not solve: a wrong attempt
    // or a skip both count, since skipping is also a way of not knowing it.
    const missed = progressRows.filter(
      (row) => row.status !== 'solved' && (row.attemptsCount > 0 || row.status === 'skipped')
    ).length;

    const now = new Date().toISOString();
    const due = progressRows.filter(
      (row) => row.status === 'solved' && row.dueAt !== null && row.dueAt <= now
    ).length;

    const attemptRows = this.db
      .select({ verdict: attempts.verdict })
      .from(attempts)
      .where(eq(attempts.userId, userId))
      .all();
    const totalAttempts = attemptRows.length;
    const correctAttempts = attemptRows.filter((row) => row.verdict === 'correct').length;

    const recentAttempts: RecentAttempt[] = this.db
      .select({
        id: attempts.id,
        slug: problems.slug,
        title: problems.title,
        verdict: attempts.verdict,
        createdAt: attempts.createdAt,
      })
      .from(attempts)
      .innerJoin(problems, eq(problems.id, attempts.problemId))
      .where(eq(attempts.userId, userId))
      .orderBy(desc(attempts.id))
      .limit(RECENT_ATTEMPT_LIMIT)
      .all();

    const byCategory: CategoryProgress[] = CATEGORIES.map((category) => {
      const inCategory = allProblems.filter((problem) => problem.category === category);
      return {
        category,
        total: inCategory.length,
        solved: inCategory.filter((problem) => solvedIds.has(problem.id)).length,
      };
    });

    const byDifficulty: DifficultyProgress[] = DIFFICULTIES.map((difficulty) => {
      const atDifficulty = allProblems.filter((problem) => problem.difficulty === difficulty);
      return {
        difficulty,
        total: atDifficulty.length,
        solved: atDifficulty.filter((problem) => solvedIds.has(problem.id)).length,
      };
    });

    const byTag: TagProgress[] = TAGS.map((tag) => {
      const tagged = allProblems.filter((problem) => parseTags(problem.tags).includes(tag));
      return {
        tag,
        total: tagged.length,
        solved: tagged.filter((problem) => solvedIds.has(problem.id)).length,
      };
    });

    return {
      hasActivity: totalAttempts > 0,
      solved: solvedIds.size,
      total: allProblems.length,
      totalAttempts,
      accuracy: totalAttempts === 0 ? 0 : Math.round((correctAttempts / totalAttempts) * 100),
      missed,
      due,
      byCategory,
      byDifficulty,
      byTag,
      recentAttempts,
      lastPracticedAt: this.lastPracticedAt(userId),
    };
  }

  private lastPracticedAt(userId: number): string | null {
    const [latestAttempt] = this.db
      .select({ createdAt: attempts.createdAt })
      .from(attempts)
      .where(eq(attempts.userId, userId))
      .orderBy(desc(attempts.createdAt))
      .limit(1)
      .all();

    const workoutRows = this.db
      .select({ startedAt: workoutAttempts.startedAt, lastRun: workoutAttempts.lastRun })
      .from(workoutAttempts)
      .where(eq(workoutAttempts.userId, userId))
      .all();

    const times = [
      latestAttempt?.createdAt,
      ...workoutRows.flatMap((row) => [row.startedAt, lastRunAt(row.lastRun)]),
    ].filter((time): time is string => typeof time === 'string');

    return times.length === 0 ? null : times.reduce((a, b) => (a > b ? a : b));
  }

  /**
   * Start over. Progress rows always reset; `clearHistory` also drops the
   * attempt rows, which is what returns the dashboard to its zero state.
   */
  resetAll(clearHistory = false): ResetAllResponse {
    const userId = this.currentUser.getUserId();

    // Sessions derive their outcomes from progress timestamps, so leaving them
    // behind would resurrect a stale session with every item back to pending.
    const mySessions = this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .all();
    for (const session of mySessions) {
      this.db.delete(sessionItems).where(eq(sessionItems.sessionId, session.id)).run();
    }
    this.db.delete(sessions).where(eq(sessions.userId, userId)).run();

    const problemsReset = this.db
      .delete(problemProgress)
      .where(eq(problemProgress.userId, userId))
      .run().changes;

    const attemptsDeleted = clearHistory
      ? this.db.delete(attempts).where(eq(attempts.userId, userId)).run().changes
      : 0;

    return { problemsReset, attemptsDeleted };
  }
}
