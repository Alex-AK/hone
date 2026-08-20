import type {
  WorkoutAttempt,
  WorkoutAttemptRecord,
  WorkoutDetail,
  WorkoutFile,
  WorkoutManifest,
  WorkoutRun,
  WorkoutSummary,
  WorkoutWorkspaceFile,
} from '@hone/shared';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { CurrentUserService } from '../common/current-user.service';
import type { AppDb } from '../db/client';
import { APP_DB } from '../db/db.module';
import { workoutAttempts } from '../db/schema';
import { skipReason, unmetRequirements } from './requirements';
import { listManifests, readBrief, readManifest } from './workout-content';
import { runCheckpoints } from './workout-runner';
import {
  destroy,
  materialise,
  readSolution,
  readWorkspace,
  restoreEditable,
  workspacePath,
  writeEditable,
} from './workspace';

@Injectable()
export class WorkoutsService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDb,
    private readonly currentUser: CurrentUserService
  ) {}

  list(): WorkoutSummary[] {
    const userId = this.currentUser.getUserId();
    const history = this.db
      .select()
      .from(workoutAttempts)
      .where(eq(workoutAttempts.userId, userId))
      .all();

    return listManifests().map((manifest) => {
      const mine = history.filter((row) => row.slug === manifest.slug);
      const best = mine.reduce((max, row) => Math.max(max, row.bestPassed), 0);
      const latest = mine
        .map((row) => row.startedAt)
        .sort()
        .at(-1);

      return {
        ...toSummary(manifest),
        bestCheckpointsPassed: mine.length > 0 ? best : null,
        lastAttemptedAt: latest ?? null,
      };
    });
  }

  /**
   * `unmet` is resolved here rather than in `list`, because this is the page the
   * clock starts from: the reader finds out what is missing where the decision
   * to install it gets made, and a list of two dozen workouts does not open a
   * socket per row.
   */
  async detail(slug: string): Promise<WorkoutDetail> {
    const manifest = this.requireManifest(slug);
    const summary = this.list().find((entry) => entry.slug === slug);
    const attempt = this.activeAttempt(slug);

    return {
      ...(summary ?? {
        ...toSummary(manifest),
        bestCheckpointsPassed: null,
        lastAttemptedAt: null,
      }),
      brief: readBrief(slug),
      editable: manifest.editable,
      checkpoints: manifest.checkpoints,
      attempt,
      history: this.history(slug),
      solution: this.solutionIfEarned(manifest, attempt),
      unmet: await unmetRequirements(manifest.requires),
    };
  }

  /**
   * Every finished attempt, newest first. A workout is entered cold and the
   * second entry is the one that measures anything, so the row that matters is
   * how long it took to go green rather than how long the attempt lasted: the
   * clock keeps running through the diff, and reading the reference is not
   * solving it again.
   */
  private history(slug: string): WorkoutAttemptRecord[] {
    return (
      this.db
        .select()
        .from(workoutAttempts)
        .where(
          and(
            eq(workoutAttempts.userId, this.currentUser.getUserId()),
            eq(workoutAttempts.slug, slug),
            isNotNull(workoutAttempts.finishedAt)
          )
        )
        // By id, not by `started_at`: two attempts a moment apart carry the same
        // millisecond, and insertion order is the order they happened in.
        .orderBy(desc(workoutAttempts.id))
        .all()
        .map((row) => ({
          startedAt: row.startedAt,
          finishedAt: row.finishedAt,
          checkpointsPassed: row.bestPassed,
          secondsToGreen: secondsBetween(row.startedAt, row.reachedGreenAt),
          solutionViewed: row.solutionViewed === 1,
        }))
    );
  }

  /** Start the clock: materialise a fresh workspace and pin the start time. */
  async start(slug: string): Promise<WorkoutDetail> {
    const manifest = this.requireManifest(slug);
    const userId = this.currentUser.getUserId();

    // Checked before the workspace exists, so a workout nobody can run leaves
    // nothing behind: no attempt row, no directory on disk, no clock running on
    // an exercise that cannot reach its first checkpoint.
    const missing = skipReason(await unmetRequirements(manifest.requires));
    if (missing) throw new ConflictException(missing);

    // One attempt at a time per workout, mirroring how sessions work.
    this.finishActive(slug);

    const [row] = this.db
      .insert(workoutAttempts)
      .values({ userId, slug, startedAt: new Date().toISOString() })
      .returning({ id: workoutAttempts.id })
      .all();

    if (row?.id === undefined) throw new Error('workouts: insert returned no id');
    materialise(row.id, manifest);
    return this.detail(slug);
  }

  saveFile(slug: string, path: string, contents: string): WorkoutWorkspaceFile[] {
    const manifest = this.requireManifest(slug);
    const attempt = this.requireActiveAttempt(slug);
    writeEditable(attempt.id, manifest, path, contents);
    return readWorkspace(attempt.id, manifest);
  }

  /** Put one file back to how the workout shipped it. */
  resetFile(slug: string, path: string): WorkoutWorkspaceFile[] {
    const manifest = this.requireManifest(slug);
    const attempt = this.requireActiveAttempt(slug);
    writeEditable(attempt.id, manifest, path, restoreEditable(manifest, path));
    return readWorkspace(attempt.id, manifest);
  }

  /**
   * `only` runs one checkpoint's suite while iterating on it. The rest carry
   * their previous result forward marked stale, so the panel keeps its shape
   * without claiming to have re-checked anything.
   */
  async run(slug: string, only?: string): Promise<WorkoutRun> {
    const manifest = this.requireManifest(slug);
    const attempt = this.requireActiveAttempt(slug);

    if (only && !manifest.checkpoints.some((checkpoint) => checkpoint.id === only)) {
      throw new BadRequestException(`No checkpoint "${only}" in workout "${slug}"`);
    }

    const result = await runCheckpoints(workspacePath(attempt.id), manifest, {
      ...(only ? { only } : {}),
      previous: attempt.lastRun ? (JSON.parse(attempt.lastRun) as WorkoutRun) : null,
    });

    // The first green run wins and later ones do not move it. Going green,
    // breaking it and fixing it again took as long as it took the first time.
    // `!only` for the same reason the solution is: a checkpoint run on its own
    // carries the others forward, and carried passes are somebody else's work.
    const wentGreen =
      !attempt.reachedGreenAt && !result.only && result.passedCount === manifest.checkpoints.length;

    this.db
      .update(workoutAttempts)
      .set({
        lastRun: JSON.stringify(result),
        bestPassed: Math.max(attempt.bestPassed, result.passedCount),
        ...(wentGreen ? { reachedGreenAt: result.ranAt } : {}),
      })
      .where(eq(workoutAttempts.id, attempt.id))
      .run();

    return result;
  }

  finish(slug: string): Promise<WorkoutDetail> {
    this.requireManifest(slug);
    this.finishActive(slug);
    return this.detail(slug);
  }

  revealSolution(slug: string): WorkoutFile[] {
    const manifest = this.requireManifest(slug);
    const attempt = this.activeAttempt(slug);
    if (attempt) {
      this.db
        .update(workoutAttempts)
        .set({ solutionViewed: 1 })
        .where(eq(workoutAttempts.id, attempt.id))
        .run();
    }
    return readSolution(manifest);
  }

  private activeAttempt(slug: string): WorkoutAttempt | null {
    const manifest = this.requireManifest(slug);
    const row = this.rawActiveAttempt(slug);
    if (!row) return null;

    return {
      id: row.id,
      slug: row.slug,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      files: readWorkspace(row.id, manifest),
      lastRun: row.lastRun ? (JSON.parse(row.lastRun) as WorkoutRun) : null,
    };
  }

  private rawActiveAttempt(slug: string) {
    const userId = this.currentUser.getUserId();
    const [row] = this.db
      .select()
      .from(workoutAttempts)
      .where(
        and(
          eq(workoutAttempts.userId, userId),
          eq(workoutAttempts.slug, slug),
          isNull(workoutAttempts.finishedAt)
        )
      )
      .orderBy(desc(workoutAttempts.id))
      .limit(1)
      .all();
    return row;
  }

  private requireActiveAttempt(slug: string) {
    const row = this.rawActiveAttempt(slug);
    if (!row) throw new NotFoundException(`No workout in progress for "${slug}". Start it first.`);
    return row;
  }

  private finishActive(slug: string): void {
    const row = this.rawActiveAttempt(slug);
    if (!row) return;
    this.db
      .update(workoutAttempts)
      .set({ finishedAt: new Date().toISOString() })
      .where(eq(workoutAttempts.id, row.id))
      .run();
    // The workspace is disposable: the row keeps the score, disk gets it back.
    destroy(row.id);
  }

  /** Shown once every checkpoint passes, or once you have asked for it. */
  private solutionIfEarned(
    manifest: WorkoutManifest,
    attempt: WorkoutAttempt | null
  ): WorkoutFile[] | null {
    if (!attempt) return null;
    const row = this.rawActiveAttempt(manifest.slug);
    // Earned on one green run of the whole suite. A partial run that happens to
    // total up to everything has not proved the same thing. `!only` rather than
    // `=== null` because runs persisted before single-checkpoint runs existed
    // have no such field.
    const allPassed =
      !attempt.lastRun?.only && attempt.lastRun?.passedCount === manifest.checkpoints.length;
    return allPassed || row?.solutionViewed === 1 ? readSolution(manifest) : null;
  }

  private requireManifest(slug: string): WorkoutManifest {
    try {
      return readManifest(slug);
    } catch {
      throw new NotFoundException(`No workout with slug "${slug}"`);
    }
  }
}

function toSummary(
  manifest: WorkoutManifest
): Omit<WorkoutSummary, 'bestCheckpointsPassed' | 'lastAttemptedAt'> {
  return {
    slug: manifest.slug,
    title: manifest.title,
    kind: manifest.kind,
    minutes: manifest.minutes,
    difficulty: manifest.difficulty,
    relevance: manifest.relevance,
    stack: manifest.stack,
    summary: manifest.summary,
    focus: manifest.focus,
    checkpointCount: manifest.checkpoints.length,
  };
}

/** Null when the attempt never went green, which is a real answer. */
function secondsBetween(from: string, to: string | null): number | null {
  if (!to) return null;
  const seconds = Math.round((Date.parse(to) - Date.parse(from)) / 1000);
  return Number.isFinite(seconds) ? Math.max(0, seconds) : null;
}
