import { inScope, isOptInCategory, REVIEW_INTERVALS_DAYS, scopeNames } from '@hone/shared';
import type {
  AttemptResponse,
  NextProblem,
  ProblemDetail,
  ProblemStatus,
  ProblemSummary,
  QueueMoveResponse,
  QueueScope,
  RevealSolutionResponse,
} from '@hone/shared';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';

import { CurrentUserService } from '../common/current-user.service';
import { parseTags } from '../common/tags';
import type { AppDb } from '../db/client';
import { APP_DB, PRACTICE_DB } from '../db/db.module';
import { attempts, problemProgress, type ProblemRow, problems } from '../db/schema';
import {
  type CodeGraderConfig,
  gradeAnswer,
  parseGraderConfig,
  type SqlGraderConfig,
  type TypeGraderConfig,
} from '../grading';

/** Failed attempts needed before the solution can be revealed. */
export const REVEAL_AFTER_ATTEMPTS = 3;

interface ProgressState {
  status: ProblemStatus;
  attemptsCount: number;
  hintsRevealed: number;
  solutionViewed: boolean;
  lastSkippedAt: string | null;
  solvedAt: string | null;
  lastSeenAt: string | null;
  dueAt: string | null;
  reviewStep: number;
  reviewCount: number;
}

const EMPTY_PROGRESS: ProgressState = {
  status: 'unseen',
  attemptsCount: 0,
  hintsRevealed: 0,
  solutionViewed: false,
  lastSkippedAt: null,
  solvedAt: null,
  lastSeenAt: null,
  dueAt: null,
  reviewStep: 0,
  reviewCount: 0,
};

interface QueueEntry {
  problem: ProblemRow;
  progress: ProgressState;
}

@Injectable()
export class ProblemsService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDb,
    @Inject(PRACTICE_DB) private readonly practiceDb: SqliteDatabase,
    private readonly currentUser: CurrentUserService
  ) {}

  list(): ProblemSummary[] {
    return this.allWithProgress()
      .sort((a, b) => a.problem.position - b.problem.position)
      .map((entry) => this.toSummary(entry));
  }

  detail(slug: string): ProblemDetail {
    const problem = this.requireProblem(slug);
    const userId = this.currentUser.getUserId();
    this.ensureProgressRow(userId, problem.id);

    let progress = this.progressFor(userId, problem.id);
    if (progress.status === 'unseen') {
      this.updateProgress(userId, problem.id, { status: 'in_progress', lastSeenAt: nowIso() });
      progress = this.progressFor(userId, problem.id);
    } else {
      this.updateProgress(userId, problem.id, { lastSeenAt: nowIso() });
    }

    return this.toDetail(problem, progress);
  }

  next(
    after?: string,
    direction: 'next' | 'prev' = 'next',
    scope: QueueScope = {}
  ): NextProblem | null {
    return this.pickNext(this.currentUser.getUserId(), after, direction, scope);
  }

  /** Problem ids in queue order, for the session picker. */
  queueSlugs(scope: QueueScope = {}): number[] {
    return this.queue(this.currentUser.getUserId(), scope).map((entry) => entry.problem.id);
  }

  async submitAttempt(slug: string, answer: string): Promise<AttemptResponse> {
    const problem = this.requireProblem(slug);
    const userId = this.currentUser.getUserId();
    const config = parseGraderConfig(problem.type, problem.graderConfig, problem.slug);

    const result = await gradeAnswer(problem.type, config, answer, this.practiceDb);

    this.ensureProgressRow(userId, problem.id);
    const before = this.progressFor(userId, problem.id);

    this.db
      .insert(attempts)
      .values({
        userId,
        problemId: problem.id,
        answer,
        verdict: result.verdict,
        // Only a problem that was already solved is being reviewed, so a first
        // pass records no rung rather than recording rung zero.
        reviewStep: before.status === 'solved' ? before.reviewStep : null,
        createdAt: nowIso(),
      })
      .run();

    const hints = config.hints;
    const solved = result.verdict === 'correct';
    const revealsHint = !solved && before.hintsRevealed < hints.length;
    const hintsRevealed = revealsHint ? before.hintsRevealed + 1 : before.hintsRevealed;
    const status: ProblemStatus = solved
      ? 'solved'
      : before.status === 'solved'
        ? 'solved'
        : 'in_progress';

    const schedule = nextSchedule(before, solved);

    this.updateProgress(userId, problem.id, {
      status,
      attemptsCount: before.attemptsCount + 1,
      // Hints are earned per attempt cycle, not owned for good. Solving ends the
      // cycle, so the next encounter starts clean: a review that opens with the
      // hints you unlocked last month hands you the answer before you have
      // tried. A failed review keeps what it just earned, because `solved` is
      // sticky and would otherwise wipe the hint on the next page load.
      hintsRevealed: solved ? 0 : hintsRevealed,
      lastSeenAt: nowIso(),
      // Refreshed on every correct answer, not just the first, so a completed
      // *review* is visible to anything comparing against an earlier snapshot.
      solvedAt: solved ? nowIso() : before.solvedAt,
      // A correct answer pulls the problem back out of the skipped queue.
      lastSkippedAt: solved ? null : before.lastSkippedAt,
      ...schedule,
    });

    const after = this.progressFor(userId, problem.id);
    // The response still shows the hints this cycle earned, even though solving
    // cleared them for the next one. Blanking the panel at the moment you got it
    // right would look like a bug.
    const revealed = hints.slice(0, solved ? before.hintsRevealed : after.hintsRevealed);
    const showSolution = solved || after.solutionViewed;

    return {
      verdict: result.verdict,
      feedback: result.feedback,
      tests: result.tests ?? [],
      newHint: revealsHint ? (hints[before.hintsRevealed] ?? null) : null,
      revealedHints: revealed,
      hintsTotal: hints.length,
      status: after.status,
      attemptsCount: after.attemptsCount,
      canRevealSolution: this.canReveal(after),
      solution: showSolution ? problem.solution : null,
      explanation: showSolution ? problem.explanation : null,
    };
  }

  skip(slug: string, scope: QueueScope = {}): QueueMoveResponse {
    const problem = this.requireProblem(slug);
    const userId = this.currentUser.getUserId();
    this.ensureProgressRow(userId, problem.id);
    const current = this.progressFor(userId, problem.id);

    if (current.status !== 'solved') {
      this.updateProgress(userId, problem.id, {
        status: 'skipped',
        lastSkippedAt: nowIso(),
        lastSeenAt: nowIso(),
      });
    }

    return {
      status: this.progressFor(userId, problem.id).status,
      // Take the head of the queue, not a step from `slug` — the skip just sent
      // it to the back, so stepping forward from it would land on itself.
      next: this.pickNext(userId, undefined, 'next', scope),
    };
  }

  revealSolution(slug: string): RevealSolutionResponse {
    const problem = this.requireProblem(slug);
    const userId = this.currentUser.getUserId();
    this.ensureProgressRow(userId, problem.id);
    const current = this.progressFor(userId, problem.id);

    if (current.status !== 'solved' && current.attemptsCount < REVEAL_AFTER_ATTEMPTS) {
      throw new BadRequestException(
        `The solution unlocks after ${REVEAL_AFTER_ATTEMPTS} attempts (you have ${current.attemptsCount}).`
      );
    }

    if (current.status !== 'solved') {
      this.updateProgress(userId, problem.id, {
        status: 'skipped',
        solutionViewed: true,
        lastSkippedAt: nowIso(),
        lastSeenAt: nowIso(),
      });
    }

    return {
      solution: problem.solution,
      explanation: problem.explanation,
      status: this.progressFor(userId, problem.id).status,
    };
  }

  reset(slug: string): QueueMoveResponse {
    const problem = this.requireProblem(slug);
    const userId = this.currentUser.getUserId();
    this.ensureProgressRow(userId, problem.id);

    // Attempt rows are deliberately kept — only the progress state resets.
    this.updateProgress(userId, problem.id, {
      status: 'unseen',
      attemptsCount: 0,
      hintsRevealed: 0,
      solutionViewed: false,
      lastSkippedAt: null,
      solvedAt: null,
      lastSeenAt: null,
      dueAt: null,
      reviewStep: 0,
      reviewCount: 0,
    });

    return { status: 'unseen', next: this.pickNext(userId, undefined, 'next') };
  }

  // ---------------------------------------------------------------- internals

  private requireProblem(slug: string): ProblemRow {
    const [row] = this.db.select().from(problems).where(eq(problems.slug, slug)).limit(1).all();
    if (!row) throw new NotFoundException(`No problem with slug "${slug}"`);
    return row;
  }

  private allWithProgress(): QueueEntry[] {
    const userId = this.currentUser.getUserId();
    const rows = this.db.select().from(problems).all();
    const progressRows = this.db
      .select()
      .from(problemProgress)
      .where(eq(problemProgress.userId, userId))
      .all();
    const byProblem = new Map(progressRows.map((row) => [row.problemId, row]));

    return rows.map((problem) => {
      const row = byProblem.get(problem.id);
      return {
        problem,
        progress: row
          ? {
              status: row.status,
              attemptsCount: row.attemptsCount,
              hintsRevealed: row.hintsRevealed,
              solutionViewed: row.solutionViewed === 1,
              lastSkippedAt: row.lastSkippedAt,
              solvedAt: row.solvedAt,
              lastSeenAt: row.lastSeenAt,
              dueAt: row.dueAt,
              reviewStep: row.reviewStep,
              reviewCount: row.reviewCount,
            }
          : { ...EMPTY_PROGRESS },
      };
    });
  }

  /**
   * Unsolved problems: never-skipped first by position, then skipped oldest-first.
   * `scope` narrows it to a focused session: some categories, some difficulties,
   * or `review` mode, which is everything you attempted or skipped and have not
   * yet solved.
   */
  private queue(_userId: number, scope: QueueScope = {}): QueueEntry[] {
    if (scope.mode === 'due') return this.dueQueue(scope);
    return (
      this.allWithProgress()
        .filter((entry) => entry.progress.status !== 'solved')
        .filter((entry) => inScope(scope.category, entry.problem.category))
        .filter((entry) => inScope(scope.difficulty, entry.problem.difficulty))
        .filter((entry) => !scope.tag || parseTags(entry.problem.tags).includes(scope.tag))
        // An opt-in category is a track you sit down to, so the round robin holds
        // back what you have never touched. Naming the category deals it, and so
        // does having attempted or skipped the rep: this keeps a track you have
        // not started out of the morning, it does not hide your own misses.
        //
        // Naming is `scopeNames` and never `inScope`, which is the whole trap in
        // making these lists. A list that contains the category names it, however
        // many others sit beside it. A list that does not, an empty list, and no
        // list at all all name nothing, so scoping to a difficulty or a tag keeps
        // the track held back exactly as an unscoped morning does.
        .filter(
          (entry) =>
            scopeNames(scope.category, entry.problem.category) ||
            !isOptInCategory(entry.problem.category) ||
            entry.progress.attemptsCount > 0 ||
            entry.progress.status === 'skipped'
        )
        .filter(
          (entry) =>
            scope.mode !== 'review' ||
            entry.progress.attemptsCount > 0 ||
            entry.progress.status === 'skipped'
        )
        .sort((a, b) => {
          const aSkipped = a.progress.lastSkippedAt;
          const bSkipped = b.progress.lastSkippedAt;
          if (aSkipped === null && bSkipped === null) {
            return a.problem.position - b.problem.position;
          }
          if (aSkipped === null) return -1;
          if (bSkipped === null) return 1;
          if (aSkipped !== bSkipped) return aSkipped < bSkipped ? -1 : 1;
          return a.problem.position - b.problem.position;
        })
    );
  }

  /**
   * Solved problems scheduled to come round again, most overdue first. Nothing
   * filters opt-in categories here on purpose: everything in this queue was
   * solved, so it is a rep you already chose, and dropping it would leave the
   * ladder broken for the one category you entered deliberately.
   */
  private dueQueue(scope: QueueScope = {}): QueueEntry[] {
    const now = nowIso();
    return this.allWithProgress()
      .filter((entry) => entry.progress.status === 'solved')
      .filter((entry) => entry.progress.dueAt !== null && entry.progress.dueAt <= now)
      .filter((entry) => inScope(scope.category, entry.problem.category))
      .filter((entry) => inScope(scope.difficulty, entry.problem.difficulty))
      .filter((entry) => !scope.tag || parseTags(entry.problem.tags).includes(scope.tag))
      .sort((a, b) => (a.progress.dueAt ?? '').localeCompare(b.progress.dueAt ?? ''));
  }

  /** Every problem due for review right now, for the dashboard count. */
  dueCount(): number {
    return this.dueQueue().length;
  }

  private pickNext(
    userId: number,
    afterSlug: string | undefined,
    direction: 'next' | 'prev',
    scope: QueueScope = {}
  ): NextProblem | null {
    const queue = this.queue(userId, scope);
    if (queue.length === 0) return null;

    const toNext = (entry: QueueEntry): NextProblem => ({
      slug: entry.problem.slug,
      title: entry.problem.title,
      category: entry.problem.category,
      difficulty: entry.problem.difficulty,
      queueSize: queue.length,
    });

    if (!afterSlug) return toNext(queue[0] as QueueEntry);

    const index = queue.findIndex((entry) => entry.problem.slug === afterSlug);
    if (index >= 0) {
      const delta = direction === 'next' ? 1 : -1;
      // Clamp rather than wrap: the queue runs easy to hard, so wrapping off the
      // front landed you on the hardest problem in the app.
      const target = queue[clamp(index + delta, queue.length)] as QueueEntry;
      return toNext(target);
    }

    // The anchor left the queue (solved, or unknown slug) — fall back to position.
    const [anchor] = this.db
      .select({ position: problems.position })
      .from(problems)
      .where(eq(problems.slug, afterSlug))
      .limit(1)
      .all();
    const position = anchor?.position ?? 0;

    // Same clamping rule: fall back to the nearest end of the queue, never across it.
    if (direction === 'next') {
      const forward = queue.find((entry) => entry.problem.position > position);
      return toNext(forward ?? (queue[queue.length - 1] as QueueEntry));
    }
    const backward = [...queue].reverse().find((entry) => entry.problem.position < position);
    return toNext(backward ?? (queue[0] as QueueEntry));
  }

  private ensureProgressRow(userId: number, problemId: number): void {
    this.db
      .insert(problemProgress)
      .values({ userId, problemId, status: 'unseen' })
      .onConflictDoNothing()
      .run();
  }

  private progressFor(userId: number, problemId: number): ProgressState {
    const [row] = this.db
      .select()
      .from(problemProgress)
      .where(and(eq(problemProgress.userId, userId), eq(problemProgress.problemId, problemId)))
      .limit(1)
      .all();
    if (!row) return { ...EMPTY_PROGRESS };
    return {
      status: row.status,
      attemptsCount: row.attemptsCount,
      hintsRevealed: row.hintsRevealed,
      solutionViewed: row.solutionViewed === 1,
      lastSkippedAt: row.lastSkippedAt,
      solvedAt: row.solvedAt,
      lastSeenAt: row.lastSeenAt,
      dueAt: row.dueAt,
      reviewStep: row.reviewStep,
      reviewCount: row.reviewCount,
    };
  }

  private updateProgress(userId: number, problemId: number, patch: Partial<ProgressState>): void {
    const values: Record<string, unknown> = {};
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.attemptsCount !== undefined) values.attemptsCount = patch.attemptsCount;
    if (patch.hintsRevealed !== undefined) values.hintsRevealed = patch.hintsRevealed;
    if (patch.solutionViewed !== undefined) values.solutionViewed = patch.solutionViewed ? 1 : 0;
    if (patch.lastSkippedAt !== undefined) values.lastSkippedAt = patch.lastSkippedAt;
    if (patch.solvedAt !== undefined) values.solvedAt = patch.solvedAt;
    if (patch.lastSeenAt !== undefined) values.lastSeenAt = patch.lastSeenAt;
    if (patch.dueAt !== undefined) values.dueAt = patch.dueAt;
    if (patch.reviewStep !== undefined) values.reviewStep = patch.reviewStep;
    if (patch.reviewCount !== undefined) values.reviewCount = patch.reviewCount;
    if (Object.keys(values).length === 0) return;

    this.db
      .update(problemProgress)
      .set(values)
      .where(and(eq(problemProgress.userId, userId), eq(problemProgress.problemId, problemId)))
      .run();
  }

  private canReveal(progress: ProgressState): boolean {
    return (
      progress.status !== 'solved' &&
      !progress.solutionViewed &&
      progress.attemptsCount >= REVEAL_AFTER_ATTEMPTS
    );
  }

  private toSummary(entry: QueueEntry): ProblemSummary {
    return {
      slug: entry.problem.slug,
      title: entry.problem.title,
      category: entry.problem.category,
      difficulty: entry.problem.difficulty,
      relevance: entry.problem.relevance,
      type: entry.problem.type,
      position: entry.problem.position,
      status: entry.progress.status,
      attemptsCount: entry.progress.attemptsCount,
      dueAt: entry.progress.dueAt,
      tags: parseTags(entry.problem.tags),
    };
  }

  private toDetail(problem: ProblemRow, progress: ProgressState): ProblemDetail {
    const config = parseGraderConfig(problem.type, problem.graderConfig, problem.slug);
    const showSolution = progress.status === 'solved' || progress.solutionViewed;

    return {
      ...this.toSummary({ problem, progress }),
      prompt: problem.prompt,
      orderMatters: problem.type === 'sql' ? (config as SqlGraderConfig).orderMatters : null,
      revealedHints: config.hints.slice(0, progress.hintsRevealed),
      hintsTotal: config.hints.length,
      // Both editor types prefill from their config; only the two use the fields.
      starter: hasEditorSource(problem.type)
        ? ((config as CodeGraderConfig | TypeGraderConfig).starter ?? null)
        : null,
      setup: hasEditorSource(problem.type)
        ? ((config as CodeGraderConfig | TypeGraderConfig).setup ?? null)
        : null,
      solutionViewed: progress.solutionViewed,
      canRevealSolution: this.canReveal(progress),
      solution: showSolution ? problem.solution : null,
      explanation: showSolution ? problem.explanation : null,
    };
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/** The two types answered in an editor, and the only two carrying starter and setup. */
function hasEditorSource(type: ProblemRow['type']): boolean {
  return type === 'js-code' || type === 'ts-type';
}

/** Hold an index inside `[0, length - 1]` so stepping off either end stays put. */
function clamp(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1);
}

/**
 * Spaced repetition. A correct answer moves one rung up the interval ladder and
 * schedules the next review; getting a review wrong drops it back to the first
 * rung so it comes round again tomorrow.
 */
function nextSchedule(
  before: ProgressState,
  solved: boolean
): Pick<ProgressState, 'dueAt' | 'reviewStep' | 'reviewCount'> {
  if (solved) {
    const wasSolved = before.status === 'solved';
    const step = wasSolved ? Math.min(before.reviewStep + 1, REVIEW_INTERVALS_DAYS.length - 1) : 0;
    return {
      dueAt: addDays(REVIEW_INTERVALS_DAYS[step] ?? 1),
      reviewStep: step,
      reviewCount: before.reviewCount + (wasSolved ? 1 : 0),
    };
  }

  // Only a *review* failure resets the ladder; a first-time wrong answer has no
  // schedule to lose.
  if (before.status === 'solved') {
    return {
      dueAt: addDays(REVIEW_INTERVALS_DAYS[0] ?? 1),
      reviewStep: 0,
      reviewCount: before.reviewCount,
    };
  }
  return { dueAt: before.dueAt, reviewStep: before.reviewStep, reviewCount: before.reviewCount };
}

function addDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
