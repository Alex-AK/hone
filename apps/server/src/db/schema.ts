import {
  CATEGORIES,
  DIFFICULTIES,
  PROBLEM_STATUSES,
  PROBLEM_TYPES,
  QUEUE_MODES,
  RELEVANCES,
  TAGS,
  VERDICTS,
} from '@hone/shared';
import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const problems = sqliteTable('problems', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  category: text('category', { enum: CATEGORIES }).notNull(),
  difficulty: text('difficulty', { enum: DIFFICULTIES }).notNull(),
  /** How often this comes up in real work. Orthogonal to difficulty. */
  relevance: text('relevance', { enum: RELEVANCES }).notNull().default('daily'),
  /**
   * JSON array of Tag. A column rather than a join table because every query
   * that reads tags already loads the whole problem set into memory and filters
   * there; a join would buy nothing and cost a table.
   */
  tags: text('tags').notNull().default('[]'),
  type: text('type', { enum: PROBLEM_TYPES }).notNull(),
  position: integer('position').notNull(),
  /** Markdown. */
  prompt: text('prompt').notNull(),
  /** JSON, discriminated by `type` — see grading/. */
  graderConfig: text('grader_config').notNull(),
  /** Markdown. */
  solution: text('solution').notNull(),
  /** Markdown. */
  explanation: text('explanation').notNull(),
});

export const attempts = sqliteTable(
  'attempts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    problemId: integer('problem_id')
      .notNull()
      .references(() => problems.id),
    answer: text('answer').notNull(),
    verdict: text('verdict', { enum: VERDICTS }).notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index('attempts_user_problem_idx').on(table.userId, table.problemId),
    index('attempts_created_at_idx').on(table.createdAt),
  ]
);

export const problemProgress = sqliteTable(
  'problem_progress',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    problemId: integer('problem_id')
      .notNull()
      .references(() => problems.id),
    status: text('status', { enum: PROBLEM_STATUSES }).notNull().default('unseen'),
    attemptsCount: integer('attempts_count').notNull().default(0),
    hintsRevealed: integer('hints_revealed').notNull().default(0),
    solutionViewed: integer('solution_viewed').notNull().default(0),
    lastSkippedAt: text('last_skipped_at'),
    /** Most recent correct answer, refreshed on every review. */
    solvedAt: text('solved_at'),
    lastSeenAt: text('last_seen_at'),
    /** Spaced repetition: when this solved problem comes round again. */
    dueAt: text('due_at'),
    /** Index into REVIEW_INTERVALS_DAYS, so the gap widens with each success. */
    reviewStep: integer('review_step').notNull().default(0),
    reviewCount: integer('review_count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.problemId] })]
);

export type ProblemRow = typeof problems.$inferSelect;
export type ProgressRow = typeof problemProgress.$inferSelect;
export type AttemptRow = typeof attempts.$inferSelect;

/**
 * A practice session: a fixed set of problems pinned at the moment you start,
 * so the list does not drift underneath you as you solve them.
 *
 * Per-item outcome is derived, not written during practice, so a session can
 * never desynchronise from the real progress table. Each item snapshots the
 * problem's solved_at / last_skipped_at at pin time; the outcome is simply
 * "has that value changed since?". A snapshot rather than a timestamp
 * comparison, because a skip and a session start can land in the same
 * millisecond and `>=` cannot tell "just before" from "during".
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    /**
     * The scope the session was pinned with: JSON arrays of Category and
     * Difficulty, since both axes take several values. The columns keep their
     * singular names, which is also what the URL calls them; renaming a column
     * in SQLite costs a table rebuild and would buy nothing this comment cannot
     * say. Both are read defensively, so a session pinned before the axes took
     * lists holds a bare `sql` and still reads back as one category.
     */
    category: text('category'),
    difficulty: text('difficulty'),
    mode: text('mode', { enum: QUEUE_MODES }),
    tag: text('tag', { enum: TAGS }),
    createdAt: text('created_at').notNull(),
    finishedAt: text('finished_at'),
  },
  (table) => [index('sessions_user_idx').on(table.userId, table.createdAt)]
);

export const sessionItems = sqliteTable(
  'session_items',
  {
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    problemId: integer('problem_id')
      .notNull()
      .references(() => problems.id),
    position: integer('position').notNull(),
    /** `problem_progress` values at the moment the session was pinned. */
    baselineSolvedAt: text('baseline_solved_at'),
    baselineSkippedAt: text('baseline_skipped_at'),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.problemId] })]
);

export type SessionRow = typeof sessions.$inferSelect;
export type SessionItemRow = typeof sessionItems.$inferSelect;

/**
 * One attempt at a workout. The workspace itself lives on disk under
 * `<data>/workouts/<id>/`; this row is the index and the history.
 */
export const workoutAttempts = sqliteTable('workout_attempts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  slug: text('slug').notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  /** JSON: the last WorkoutRun, so the UI survives a reload. */
  lastRun: text('last_run'),
  /** Best checkpoint count across every run of this attempt. */
  bestPassed: integer('best_passed').notNull().default(0),
  solutionViewed: integer('solution_viewed').notNull().default(0),
  /**
   * When every checkpoint first passed together, which is the only column that
   * can answer how long a second attempt took against a first. Nothing already
   * here could: `last_run` is overwritten by every run and the workout invites
   * more of them, since the diff and the reference only unlock on green;
   * `finished_at` is when Finish was pressed, after the review; `best_passed`
   * says you got there and never when. Written once, on the first green run.
   */
  reachedGreenAt: text('reached_green_at'),
});
