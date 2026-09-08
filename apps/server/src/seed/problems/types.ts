import type { Category, Difficulty, ProblemType, Relevance, Tag } from '@hone/shared';

import type {
  CodeGraderConfig,
  ExplainGraderConfig,
  ShortTextGraderConfig,
  SqlGraderConfig,
  TypeGraderConfig,
} from '../../grading/types';

export interface ProblemSeed {
  slug: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  /**
   * How often this comes up in real work, independent of difficulty. Author it
   * honestly: `foundational` is not an insult, it's how you tell the morning
   * reps that matter today from the ones that explain why things work.
   */
  relevance: Relevance;
  /**
   * Cross-cutting selectors, and almost always absent. A tag is for a posture
   * somebody would scope fifteen minutes to, not for keywording: if nobody
   * would practise it deliberately, the rep's category already says enough.
   */
  tags?: Tag[];
  type: ProblemType;
  /** Assigned automatically in problems.seed.ts. Authors don't set it. */
  position: number;
  /** Markdown. */
  prompt: string;
  graderConfig:
    | SqlGraderConfig
    | ShortTextGraderConfig
    | ExplainGraderConfig
    | CodeGraderConfig
    | TypeGraderConfig;
  /**
   * A model answer in the form a user would actually type. Not persisted. The
   * smoke tests submit it to prove every seeded problem is solvable.
   */
  canonicalAnswer: string;
  /** Markdown. The canonical answer, shown once solved. */
  solution: string;
  /** Markdown. Why the answer is what it is. */
  explanation: string;
}

/** Authoring shape: same as ProblemSeed minus the generated position. */
export type ProblemDraft = Omit<ProblemSeed, 'position'>;

/** Join lines into a markdown block. Keeps ``` fences readable in source. */
export const md = (...lines: string[]): string => lines.join('\n');

/** Wrap code in a fenced block. */
export const code = (language: string, ...lines: string[]): string =>
  md(`\`\`\`${language}`, ...lines, '```');

/**
 * An ASCII diagram: a fenced block with no language, so nothing tries to
 * highlight it as code. Keep a diagram under about 70 columns, which is what
 * the reading measure a problem and a handbook page share will hold without
 * scrolling sideways.
 */
export const diagram = (...lines: string[]): string => code('', ...lines);

/** A SQL problem. Solution SQL doubles as the canonical answer. */
export function sqlProblem(draft: {
  slug: string;
  title: string;
  category?: Category;
  difficulty: Difficulty;
  relevance: Relevance;
  tags?: Tag[];
  prompt: string;
  solutionSql: string;
  orderMatters: boolean;
  hints: string[];
  /** Pretty-printed solution; falls back to the one-line solutionSql. */
  solutionSource?: string[];
  explanation: string;
}): ProblemDraft {
  return {
    slug: draft.slug,
    title: draft.title,
    category: draft.category ?? 'sql',
    difficulty: draft.difficulty,
    relevance: draft.relevance,
    ...(draft.tags ? { tags: draft.tags } : {}),
    type: 'sql',
    prompt: draft.prompt,
    graderConfig: {
      solutionSql: draft.solutionSql,
      orderMatters: draft.orderMatters,
      hints: draft.hints,
    },
    canonicalAnswer: draft.solutionSql,
    solution: code('sql', ...(draft.solutionSource ?? [draft.solutionSql])),
    explanation: draft.explanation,
  };
}

/**
 * A "write the function" problem. The reference implementation doubles as the
 * canonical answer and the displayed solution, so they can never drift apart.
 */
export function codeProblem(draft: {
  slug: string;
  title: string;
  category?: Category;
  difficulty: Difficulty;
  relevance: Relevance;
  tags?: Tag[];
  prompt: string;
  /** Prefilled into the editor: the signature, so the name matches the tests. */
  starter: string;
  /** Runs before the submission. Shown read-only above the editor, because the
   * tests name these values and a failing assertion has to be readable. */
  setup?: string;
  tests: CodeGraderConfig['tests'];
  /** The reference implementation. Must pass its own tests (asserted in the specs). */
  reference: string;
  hints: string[];
  explanation: string;
}): ProblemDraft {
  return {
    slug: draft.slug,
    title: draft.title,
    category: draft.category ?? 'coding',
    difficulty: draft.difficulty,
    relevance: draft.relevance,
    ...(draft.tags ? { tags: draft.tags } : {}),
    type: 'js-code',
    prompt: draft.prompt,
    graderConfig: {
      ...(draft.setup ? { setup: draft.setup } : {}),
      starter: draft.starter,
      tests: draft.tests,
      hints: draft.hints,
    },
    canonicalAnswer: draft.reference,
    solution: code('js', draft.reference),
    explanation: draft.explanation,
  };
}

/**
 * A "write the type" problem. Nothing runs: the answer is type-checked and the
 * assertions are made against what the checker inferred. The reference doubles
 * as the canonical answer and the displayed solution, so they cannot drift.
 */
export function typeProblem(draft: {
  slug: string;
  title: string;
  category?: Category;
  difficulty: Difficulty;
  relevance: Relevance;
  tags?: Tag[];
  prompt: string;
  /** Prefilled into the editor: the name the checks use has to be on screen. */
  starter: string;
  /** Declarations in scope before the answer. Shown read-only above the editor. */
  setup?: string;
  tests: TypeGraderConfig['tests'];
  /** The reference answer. Must pass its own checks (asserted in the specs). */
  reference: string;
  hints: string[];
  explanation: string;
}): ProblemDraft {
  return {
    slug: draft.slug,
    title: draft.title,
    category: draft.category ?? 'typescript',
    difficulty: draft.difficulty,
    relevance: draft.relevance,
    ...(draft.tags ? { tags: draft.tags } : {}),
    type: 'ts-type',
    prompt: draft.prompt,
    graderConfig: {
      ...(draft.setup ? { setup: draft.setup } : {}),
      starter: draft.starter,
      tests: draft.tests,
      hints: draft.hints,
    },
    canonicalAnswer: draft.reference,
    solution: code('ts', draft.reference),
    explanation: draft.explanation,
  };
}
