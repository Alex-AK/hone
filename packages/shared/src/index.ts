/**
 * Shared API types for Hone. Types + const tuples only — no runtime deps.
 */

export const CATEGORIES = [
  'sql',
  'query-params',
  'js-apis',
  'typescript',
  'react',
  'http',
  'dom',
  'css',
  'a11y',
  'forms',
  'dates',
  'testing',
  'security',
  'debugging',
  'coding',
  'systems',
  'html',
  'ai-engineering',
  'logic',
  'node',
  'sql-performance',
  'orm',
  'dependencies',
  'dsa-patterns',
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Categories the daily queue never deals you. This is the exact opposite of a
 * tag: a tag is opt-in, naming a slice you can enter deliberately, and this is
 * opt-out, pulling a category out of a round robin that would otherwise deal it
 * alongside everything else.
 *
 * It holds back what you have never touched, not your own history. Name the
 * category in a scope, alone or alongside others, and you get the whole thing;
 * attempt or skip a rep and it behaves like any other rep from then on, review
 * and spaced repetition included. Otherwise the morning would hide the misses it
 * just gave you.
 */
export const OPT_IN_CATEGORIES: readonly Category[] = ['dsa-patterns'];

export function isOptInCategory(category: Category): boolean {
  return OPT_IN_CATEGORIES.includes(category);
}

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/**
 * A tag cuts across categories, which is the axis a category cannot express.
 * A rep about what a `LEFT JOIN` condition does belongs in the SQL queue
 * whatever shape the question takes, so the shape is a tag and not a category.
 *
 * Tags are for a posture you can sit down and practise on purpose, not for
 * arbitrary keywording: a tag nobody would ever scope a session to is a tag
 * that should not exist. The daily queue ignores them entirely and keeps
 * dealing every rep, because interleaving is what retention wants.
 */
export const TAGS = ['reading'] as const;
export type Tag = (typeof TAGS)[number];

export const TAG_LABELS: Record<Tag, string> = {
  reading: 'Code reading',
};

export const TAG_BLURBS: Record<Tag, string> = {
  reading: 'Unfamiliar code, and a question about what it does.',
};

/**
 * How often the knowledge actually comes up, which is a separate axis from how
 * hard the problem is. A hard problem can be daily bread (`sql-window-rank`)
 * and an easy one can be pure under-the-hood trivia (`dom-queryselectorall-type`).
 */
export const RELEVANCES = ['daily', 'occasional', 'foundational'] as const;
export type Relevance = (typeof RELEVANCES)[number];

/**
 * `ts-type` is the odd one out: the answer is a type rather than a value, and
 * nothing runs. The submission is type-checked and the assertions are made
 * against the type the checker inferred, which is the only way to examine
 * conditional types, `infer`, mapped types and assertion functions by doing
 * them rather than by asking about them.
 */
export const PROBLEM_TYPES = ['sql', 'short-text', 'explain', 'js-code', 'ts-type'] as const;
export type ProblemType = (typeof PROBLEM_TYPES)[number];

export const VERDICTS = ['correct', 'close', 'incorrect'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const PROBLEM_STATUSES = ['unseen', 'in_progress', 'solved', 'skipped'] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

export const RELEVANCE_LABELS: Record<Relevance, string> = {
  daily: 'Daily',
  occasional: 'Occasional',
  foundational: 'Foundational',
};

/** Tooltip copy for the relevance badge. */
export const RELEVANCE_BLURBS: Record<Relevance, string> = {
  daily: 'You write this in ordinary feature work.',
  occasional: 'Comes up in specific situations: a bug, a perf pass, an edge case.',
  foundational: "Under the hood. You'll meet it through a framework more often than you write it.",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  sql: 'SQL',
  'query-params': 'Query Params',
  'js-apis': 'JS APIs',
  typescript: 'TypeScript',
  react: 'React',
  http: 'HTTP & Fetch',
  dom: 'DOM & Browser',
  css: 'CSS & Layout',
  a11y: 'Accessibility',
  forms: 'Forms & Validation',
  dates: 'Dates & Time',
  testing: 'Testing',
  security: 'Auth & Security',
  debugging: 'Debugging',
  coding: 'Coding',
  systems: 'Systems',
  html: 'HTML & Semantics',
  'ai-engineering': 'AI Engineering',
  logic: 'Logic',
  node: 'Node Runtime',
  'sql-performance': 'SQL Performance',
  orm: 'ORMs',
  dependencies: 'Dependencies',
  'dsa-patterns': 'DSA Patterns',
};

/** Row in the problem list (`GET /api/problems`). */
export interface ProblemSummary {
  slug: string;
  /** When this solved problem next comes round for review. */
  dueAt?: string | null;
  title: string;
  category: Category;
  difficulty: Difficulty;
  relevance: Relevance;
  type: ProblemType;
  position: number;
  status: ProblemStatus;
  attemptsCount: number;
  /** Cross-cutting selectors. Usually empty: most reps are only their category. */
  tags: Tag[];
}

/** Full problem view (`GET /api/problems/:slug`). */
export interface ProblemDetail extends ProblemSummary {
  prompt: string;
  orderMatters: boolean | null;
  revealedHints: string[];
  hintsTotal: number;
  solutionViewed: boolean;
  canRevealSolution: boolean;
  /** Prefilled editor contents for `js-code` and `ts-type` problems. */
  starter: string | null;
  /**
   * What a `js-code` or `ts-type` problem's tests are written against, shown
   * read-only above the editor: fixtures for the first, the declarations the
   * answer builds on for the second. The tests name these, so withholding them
   * makes a failing assertion unreadable.
   */
  setup: string | null;
  /** Present only when solved or the solution has been revealed. */
  solution: string | null;
  explanation: string | null;
}

/** `POST /api/problems/:slug/attempts` request body. */
export interface AttemptRequest {
  answer: string;
}

/** One assertion from a `js-code` or `ts-type` problem's test suite. */
export interface CodeTestResult {
  name: string;
  passed: boolean;
  /** Why it failed: expected vs actual, or the thrown error. */
  detail?: string;
  /**
   * Failed, but only just: `ts-type` sets it when the answer's type is
   * assignable to the expected type and back again without being identical.
   * Returning `any` and dropping a `readonly` both land here, and both deserve
   * amber rather than red.
   */
  near?: boolean;
}

/** `POST /api/problems/:slug/attempts` response. */
export interface AttemptResponse {
  verdict: Verdict;
  feedback: string;
  /** Per-test results for `js-code` and `ts-type` problems. */
  tests: CodeTestResult[];
  /** The hint unlocked by this attempt, if any. */
  newHint: string | null;
  revealedHints: string[];
  hintsTotal: number;
  status: ProblemStatus;
  attemptsCount: number;
  canRevealSolution: boolean;
  /** Included when the verdict is `correct`. */
  solution: string | null;
  explanation: string | null;
}

/** `POST /api/problems/:slug/reveal-solution` response. */
export interface RevealSolutionResponse {
  solution: string;
  explanation: string;
  status: ProblemStatus;
}

/** `POST /api/problems/:slug/skip` and `/reset` responses. */
export interface QueueMoveResponse {
  status: ProblemStatus;
  next: NextProblem | null;
}

export interface NextProblem {
  slug: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  /** Number of problems still in the queue, including this one. */
  queueSize: number;
}

export const QUEUE_MODES = ['all', 'review', 'due'] as const;
/**
 * `review` = attempted or skipped, and still unsolved.
 * `due` = solved before, and scheduled to come round again.
 */
export type QueueMode = (typeof QUEUE_MODES)[number];

/**
 * Narrows the practice queue to a focused session.
 *
 * `category` and `difficulty` are lists, because a morning is often two or three
 * categories rather than one. They keep their singular names because the wire
 * spells a list as a repeated `?category=sql&category=react`, and one word from
 * the link you click to the filter that reads it is worth more than grammar: a
 * repeated param also means a slug can never collide with a separator. Absent or
 * empty means every value on that axis, so ask with `inScope` rather than by
 * hand — an empty array is truthy and would otherwise scope a queue to nothing.
 *
 * `mode` and `tag` stay single. A tag is one axis by design, and the modes are
 * three different queues rather than three values of one.
 */
export interface QueueScope {
  category?: readonly Category[];
  difficulty?: readonly Difficulty[];
  mode?: QueueMode;
  /** Cuts across categories: the one axis `category` cannot express. */
  tag?: Tag;
}

/**
 * Whether a scope axis lets a value through. An absent or empty list is every
 * value on that axis, which is what an unscoped queue is.
 */
export function inScope<T>(selected: readonly T[] | undefined, value: T): boolean {
  return selected === undefined || selected.length === 0 || selected.includes(value);
}

/**
 * Whether a scope *names* a category, which is a different question from whether
 * the category is in scope: an unscoped queue admits every category and names
 * none of them. Naming is what deals an opt-in category, so a list containing
 * `dsa-patterns` opts you into it however many other categories sit beside it,
 * and a list that leaves it out holds it back exactly as no list at all does.
 */
export function scopeNames(selected: readonly Category[] | undefined, category: Category): boolean {
  return selected !== undefined && selected.includes(category);
}

/**
 * Spaced-repetition ladder, in days. Solving a problem schedules it one rung up;
 * getting it wrong on review drops it back to the first rung.
 */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 21, 60] as const;

export const DEFAULT_SESSION_SIZE = 10;
export const MAX_SESSION_SIZE = 50;

export const SESSION_ITEM_STATUSES = ['pending', 'solved', 'skipped'] as const;
export type SessionItemStatus = (typeof SESSION_ITEM_STATUSES)[number];

/** `POST /api/sessions` request body. */
export interface CreateSessionRequest extends QueueScope {
  /** How many problems to pull. Defaults to 10, capped at 50. */
  size?: number;
}

export interface SessionItem {
  slug: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  relevance: Relevance;
  position: number;
  status: SessionItemStatus;
}

/** A morning session: a fixed set of problems, pinned when you start. */
export interface SessionResponse {
  id: number;
  createdAt: string;
  finishedAt: string | null;
  scope: QueueScope;
  items: SessionItem[];
  /** Counts across `items`. */
  total: number;
  solved: number;
  skipped: number;
  remaining: number;
  /** Slug of the next unfinished item, or null when the session is done. */
  nextSlug: string | null;
  /** Wall-clock seconds from start to finish (or to now while active). */
  elapsedSeconds: number;
}

/** `POST /api/progress/reset` request body. */
export interface ResetAllRequest {
  /** Also delete every attempt row, returning the dashboard to its zero state. */
  clearHistory?: boolean;
}

export interface ResetAllResponse {
  problemsReset: number;
  attemptsDeleted: number;
}

export interface CategoryProgress {
  category: Category;
  solved: number;
  total: number;
}

export interface DifficultyProgress {
  difficulty: Difficulty;
  solved: number;
  total: number;
}

/** Counts behind a tag, so an entrance can say how much is there. */
export interface TagProgress {
  tag: Tag;
  solved: number;
  total: number;
}

export interface RecentAttempt {
  id: number;
  slug: string;
  title: string;
  verdict: Verdict;
  createdAt: string;
}

/** `GET /api/progress` — the dashboard payload. */
export interface ProgressResponse {
  hasActivity: boolean;
  solved: number;
  total: number;
  totalAttempts: number;
  /** Percentage 0–100, rounded. */
  accuracy: number;
  /** Problems attempted or skipped and still unsolved: the review queue. */
  missed: number;
  /** Solved problems whose spaced-repetition review is due now. */
  due: number;
  byCategory: CategoryProgress[];
  byDifficulty: DifficultyProgress[];
  byTag: TagProgress[];
  recentAttempts: RecentAttempt[];
}

export interface PracticeColumn {
  name: string;
  type: string;
}

export interface PracticeTable {
  name: string;
  columns: PracticeColumn[];
  rowCount: number;
}

/** `GET /api/practice-schema` — powers the SQL side panel. */
export interface PracticeSchemaResponse {
  tables: PracticeTable[];
}

/* ------------------------------------------------------------------ workouts */

/**
 * A workout is a 15-30 minute build against a real toolchain: edit files in the
 * IDE, run the checkpoints, see how far you got. Content lives in
 * `packages/workouts/content/<slug>/`, so adding one touches no code.
 */
export const WORKOUT_KINDS = ['feature', 'bug-hunt', 'refactor'] as const;
export type WorkoutKind = (typeof WORKOUT_KINDS)[number];

export const WORKOUT_KIND_LABELS: Record<WorkoutKind, string> = {
  feature: 'Build a feature',
  'bug-hunt': 'Find the bugs',
  refactor: 'Restructure it',
};

/** Free-form on purpose: the point is to practise against stacks you do not know. */
export interface WorkoutStack {
  server?: string;
  orm?: string;
  database?: string;
  client?: string;
}

export interface WorkoutCheckpoint {
  id: string;
  title: string;
  /** Path within the workout directory. One suite per checkpoint. */
  testFile: string;
  hint?: string;
}

/**
 * The two things a workout may say about how its own suites run. Both are
 * optional and both are translated by the runner rather than handed over, so a
 * workout never reaches the settings that decide whether a checkpoint can fail:
 * `include`, the timeouts, the reporter.
 */
export interface WorkoutTestRun {
  /**
   * IANA zone name, applied as `TZ` to the process the suites run in. A fake
   * clock moves `now` without moving the zone, so a workout about a DST
   * boundary needs this and cannot get there any other way.
   */
  timezone?: string;
  /**
   * A file under the workout's own `tests/`, run before every suite. This is
   * where a global the environment lacks gets registered: `ResizeObserver`,
   * `IntersectionObserver`, `matchMedia`.
   */
  setupFile?: string;
}

/**
 * What a requirement names, which is a binary, a port, or both, and never
 * neither. Which of the three depends on the dependency rather than on taste: a
 * command line tool is a binary, and a daemon you connect to is a port, because
 * a container and an app bundle both serve the port with nothing on `PATH`.
 *
 * - `binary` is an executable that has to resolve on `PATH`. A bare name, never
 *   a path: the check scans `PATH`, and a path would let a workout point at a
 *   file in the repo and declare a requirement that is always met.
 * - `port` is a loopback port something has to accept a connection on. It is
 *   also the port the suites are handed, so what was checked and what gets
 *   connected to are one value.
 */
export type WorkoutRequirementNeed =
  { binary: string; port?: number } | { binary?: undefined; port: number };

/**
 * Something the workout needs that this repo does not ship: a real Postgres, a
 * Mongo daemon, Docker. Declaring one is what makes it safe to need one, because
 * everything that runs the workout checks first and skips rather than fails.
 * A local process is not the network, but a daemon is not on every laptop.
 */
export type WorkoutRequirement = WorkoutRequirementNeed & {
  /** One line the reader can run: how to install it, and how to start it. */
  install: string;
  /** One line: what the workout does with it that a fake could not. */
  reason: string;
};

/** A requirement the machine did not meet, as the reader is told about it. */
export interface UnmetRequirement {
  /** Absent when the requirement named a port and nothing else. */
  binary?: string;
  /** Absent when the requirement named a binary and nothing else. */
  port?: number;
  /**
   * Nothing on `PATH`, or nothing answering on the port. The second covers both
   * a binary that is installed and not started and a port nobody claims, which
   * are the same sentence to a reader with a port to fix.
   */
  state: 'not-installed' | 'not-running';
  /** One line, ready to display: what is missing, and which of the two it is. */
  message: string;
  install: string;
  reason: string;
}

export interface WorkoutManifest {
  slug: string;
  title: string;
  kind: WorkoutKind;
  /** The timer the workout is designed around. */
  minutes: number;
  difficulty: Difficulty;
  relevance: Relevance;
  stack: WorkoutStack;
  summary: string;
  focus: string[];
  /** Files the editor opens. Everything else in the workspace is read-only. */
  editable: string[];
  checkpoints: WorkoutCheckpoint[];
  /** Absent on almost every workout, and absent means "run as the scaffold says". */
  testRun?: WorkoutTestRun;
  /**
   * Absent on almost every workout, and absent means "runs anywhere the repo
   * runs". Naming something here cannot make a checkpoint pass: it can only
   * stop the workout running at all, on every machine that lacks it.
   */
  requires?: WorkoutRequirement[];
}

/** Row in the workout list (`GET /api/workouts`). */
export interface WorkoutSummary {
  slug: string;
  title: string;
  kind: WorkoutKind;
  minutes: number;
  difficulty: Difficulty;
  relevance: Relevance;
  stack: WorkoutStack;
  summary: string;
  focus: string[];
  checkpointCount: number;
  /** Best result so far, or null if never attempted. */
  bestCheckpointsPassed: number | null;
  lastAttemptedAt: string | null;
}

export interface WorkoutFile {
  path: string;
  contents: string;
}

/**
 * A file in the materialised workspace. The tree carries every file the workout
 * ships, not only the ones the manifest names, because briefs across the library
 * say "read it" about files the editor could not open: a contract the client
 * parses with, a fake whose semantics are the whole exercise. `editable` is what
 * separates the two, and the server refuses a write to anything without it.
 */
export interface WorkoutWorkspaceFile extends WorkoutFile {
  editable: boolean;
}

/** An in-progress attempt: a materialised workspace plus a clock. */
export interface WorkoutAttempt {
  id: number;
  slug: string;
  startedAt: string;
  finishedAt: string | null;
  files: WorkoutWorkspaceFile[];
  lastRun: WorkoutRun | null;
}

/**
 * Something the checkpoint saw, handed over by the suite itself: the JSON body
 * an endpoint answered with, the rows a query returned, `prettyDOM` output.
 *
 * `body` is text and only ever text. It is a transcript of a run that is over,
 * not a payload to re-execute or markup to re-render, and the type says so
 * because that is the whole line between one panel and a second runtime.
 */
export interface WorkoutTranscriptEntry {
  label: string;
  body: string;
  /** The run produced more than the panel is willing to carry. */
  truncated: boolean;
}

export interface WorkoutCheckpointResult {
  id: string;
  title: string;
  hint?: string;
  status: 'passed' | 'failed' | 'not-run';
  testsPassed: number;
  testsTotal: number;
  /** First failing assertion, trimmed for display. */
  failure: string | null;
  /** Absent on the checkpoints whose subject is not a shape, which is most. */
  transcript?: WorkoutTranscriptEntry[];
  /**
   * Carried over from an earlier run, not re-checked by the run that returned
   * it. Only a single-checkpoint run produces these, and the UI has to say so:
   * a green tick nobody just verified is the one lie the panel could tell.
   */
  stale?: boolean;
}

export interface WorkoutRun {
  ranAt: string;
  durationMs: number;
  checkpoints: WorkoutCheckpointResult[];
  /**
   * Checkpoints this run verified as passing. Carried-over results never count,
   * which is what keeps a one-checkpoint run from inflating your best score.
   */
  passedCount: number;
  /** The checkpoint id when one was run on its own, null for the whole suite. */
  only: string | null;
  /** Set when the suite could not run at all: a syntax error, a bad import. */
  crashed: string | null;
  /**
   * Set when the suites were never started, because the machine is missing
   * something the workout declared. Nothing ran, so nothing passed: this says so
   * rather than letting an all-green-by-default panel imply otherwise.
   */
  skipped: string | null;
}

/* ------------------------------------------------------------------ handbook */

/**
 * The handbook is the study half: short pages you read beside a
 * workout, each wired to the problems and workouts that prove you absorbed it.
 * Content lives in `packages/handbook/content/<section>/<slug>.md`, so adding a
 * page touches no code.
 */
export interface HandbookSource {
  author: string;
  title: string;
  url: string;
}

/** A problem or workout that exercises a page's material. */
export interface HandbookPractiseLink {
  kind: 'problem' | 'workout';
  slug: string;
  title: string;
  /**
   * Shown on the link, and what the list is sorted by. A page can be fully
   * paired and still offer nothing but the hard version, which is an on-ramp
   * the reader cannot see from the authored order alone.
   */
  difficulty: Difficulty;
}

export interface HandbookPageSummary {
  section: string;
  slug: string;
  title: string;
  /** The question the page answers, phrased the way you'd ask it when stuck. */
  question: string;
  /** Problem and workout slugs, unresolved. Enough to link back from either. */
  practise: string[];
}

export interface HandbookSectionSummary {
  slug: string;
  title: string;
  summary: string;
  pages: HandbookPageSummary[];
}

/** A neighbouring page, for moving through a section in order. */
export interface HandbookPageRef {
  section: string;
  slug: string;
  title: string;
}

export interface HandbookPageDetail extends HandbookPageSummary {
  sectionTitle: string;
  /** Markdown, frontmatter stripped. */
  body: string;
  sources: HandbookSource[];
  /** ISO date the page's claims were last checked against its sources. */
  verified: string;
  practiseLinks: HandbookPractiseLink[];
  previous: HandbookPageRef | null;
  next: HandbookPageRef | null;
}

/**
 * A finished attempt, for reading a second and third one against the first.
 * Time-to-green is the number worth watching: a workout entered cold measures
 * how long it took to work out what was wrong, and entering it again measures
 * whether that stayed learned.
 */
export interface WorkoutAttemptRecord {
  startedAt: string;
  finishedAt: string | null;
  /** Best across the attempt's runs, so an attempt that broke it again keeps it. */
  checkpointsPassed: number;
  /** Start to the first fully green run. Null for an attempt that never got there. */
  secondsToGreen: number | null;
  solutionViewed: boolean;
}

export interface WorkoutDetail extends WorkoutSummary {
  brief: string;
  editable: string[];
  checkpoints: WorkoutCheckpoint[];
  attempt: WorkoutAttempt | null;
  /** Finished attempts, newest first. Empty until you have done it once. */
  history: WorkoutAttemptRecord[];
  /** Revealed once every checkpoint passes, or on request. */
  solution: WorkoutFile[] | null;
  /**
   * Checked when the page is read, not when the workout was authored: a daemon
   * stops between one visit and the next. Empty means the workout runs here, and
   * it is empty for every workout that declares nothing.
   */
  unmet: UnmetRequirement[];
}

/* ------------------------------------------------------------------- modules */

/**
 * A module is one sitting with one API: 15 to 25 minutes of ordered steps, and
 * every step is predict, run, correct. It is the format for the APIs you use
 * constantly and understand shallowly, where the problem is not being stuck but
 * holding a wrong model that has never cost enough to notice. Content lives in
 * `packages/modules/content/<slug>/`, so adding one touches no code.
 */
export interface ModuleStep {
  /** Filename without its ordering prefix: stable, and the URL fragment. */
  id: string;
  title: string;
  /** The question you answer before running anything. */
  predict: string;
  /** Markdown, with the code fences lifted out. */
  body: string;
  /** The snippet, prefilled into the editor and yours to change. */
  code: string;
  /** Expressions evaluated after the snippet. Each one must come out true. */
  assertions: string[];
}

/** Row in the module list (`GET /api/modules`). */
export interface ModuleSummary {
  slug: string;
  title: string;
  summary: string;
  order: number;
  minutes: number;
  stepCount: number;
}

export interface ModuleDetail extends ModuleSummary {
  steps: ModuleStep[];
  sources: HandbookSource[];
  /** ISO date the module's claims were last checked against its sources. */
  verified: string;
  /** Where to practise it afterwards, resolved the way a page's list is. */
  practiseLinks: HandbookPractiseLink[];
}

/** `POST /api/modules/:slug/steps/:stepId/run` request body. */
export interface ModuleRunRequest {
  /** The editor contents. The assertions come from the step, not from here. */
  code: string;
}

export interface ModuleRunResponse {
  /** Set when the snippet could not be evaluated at all. */
  error: string | null;
  results: CodeTestResult[];
  logs: string[];
  passed: boolean;
}

/* --------------------------------------------------------------------- cards */

/**
 * Two-sided cards, a few seconds each, self-graded and never written down: the
 * reps a card cites are the progress tracking, exactly as a module's are.
 *
 * A deck is the authoring unit and the correctness anchor. It groups one
 * contrast and cites the handbook page its cards are checked against, which is
 * what makes a claim checkable at all. It is not a thing a reader picks: the
 * app already asks which mode you want, and asking which deck on top of that is
 * a second decision inside fifteen minutes. So there is one endpoint, it serves
 * every card there is, and the deck survives only as the tag that says where a
 * card came from. Content lives in `packages/decks/content/<slug>/deck.json`.
 */
export interface DeckCard {
  /** Kebab-case, unique within its deck. Pair it with `deck` to key a list. */
  id: string;
  /** The question. Markdown, one line. */
  front: string;
  /** The answer. Markdown, one line. */
  back: string;
}

/** A card in the library, tagged with the deck it was checked against. */
export interface LibraryCard extends DeckCard {
  /** Deck slug, and the key into `CardLibrary.decks`. */
  deck: string;
}

/**
 * A deck as the run needs it: somewhere a card came from, not somewhere to go.
 * The summary reads these to credit the pages and reps behind a run, which is
 * why nothing here describes the deck itself.
 */
export interface CardDeck {
  slug: string;
  /** The page the deck's cards are checked against. */
  page: HandbookPageRef | null;
  /** Where to practise the material, resolved the way a page's list is. */
  practiseLinks: HandbookPractiseLink[];
  sources: HandbookSource[];
  /** ISO date the deck's claims were last checked against its sources. */
  verified: string;
}

/**
 * `GET /api/decks/cards`: the whole library in one call, so the client never
 * fans out over decks. Cards arrive in deck order and the client shuffles, so a
 * cached response can't hand you the same first card two mornings running.
 */
export interface CardLibrary {
  cards: LibraryCard[];
  decks: CardDeck[];
}

/* --------------------------------------------------------------------- paths */

/**
 * The essentials path: a curated route through content that already exists.
 * One path is one hour on one slice of the work, read then proved then built,
 * and the deliberate opposite of the daily queue's interleaving. Content lives
 * in `packages/paths/content/<slug>/path.json`, so adding an hour touches no
 * code.
 *
 * `PATH_STEP_KINDS` is every kind a session may author. `module` sat here as a
 * reserved kind the loader refused, from before modules existed until the day
 * they did, which cost exactly the one case in a switch it was reserved to
 * cost. Nothing is reserved now, so there is one list rather than two.
 */
export const PATH_STEP_KINDS = ['page', 'problem', 'workout', 'module'] as const;
export type PathStepKind = (typeof PATH_STEP_KINDS)[number];

/** A step as authored: a kind, what it points at, and why it is here. */
export interface PathStep {
  kind: PathStepKind;
  /** `section/slug` for a page, a bare slug for anything else. */
  ref: string;
  note?: string;
}

interface PathStepBase {
  /** Position in the session, from 0. */
  index: number;
  ref: string;
  note: string | null;
  /** Whether the rep behind this step has been done. A page carries no
   * progress and is never done: that is the standing non-goal, not an omission. */
  done: boolean;
}

export interface PathPageStep extends PathStepBase {
  kind: 'page';
  section: string;
  sectionTitle: string;
  slug: string;
  title: string;
  question: string;
}

export interface PathModuleStep extends PathStepBase {
  kind: 'module';
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  stepCount: number;
}

export interface PathProblemStep extends PathStepBase {
  kind: 'problem';
  slug: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  relevance: Relevance;
  status: ProblemStatus;
}

export interface PathWorkoutStep extends PathStepBase {
  kind: 'workout';
  slug: string;
  title: string;
  workoutKind: WorkoutKind;
  minutes: number;
  summary: string;
  checkpointCount: number;
  /** Best result so far, or null if never attempted. */
  bestCheckpointsPassed: number | null;
}

export type PathStepDetail = PathModuleStep | PathPageStep | PathProblemStep | PathWorkoutStep;

/** Row in the path list (`GET /api/paths`). */
export interface PathSummary {
  slug: string;
  title: string;
  /** The question the hour answers, and the test of whether the slice holds. */
  question: string;
  summary: string;
  order: number;
  /** The budget the session was written against. */
  minutes: number;
  stepCount: number;
  /** Steps that carry progress: the problems and workouts, never the pages. */
  provable: number;
  done: number;
}

export interface PathDetail extends PathSummary {
  steps: PathStepDetail[];
  /**
   * Where you left off: the first step carrying progress that is not done, or
   * null once they all are. Derived from the reps, so nothing is stored and
   * there is no migration.
   */
  resumeIndex: number | null;
}
