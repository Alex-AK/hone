import type {
  CardLibrary,
  ModuleSummary,
  PathSummary,
  ProblemSummary,
  ProgressResponse,
  SessionResponse,
  WorkoutSummary,
} from '@hone/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      progress: vi.fn(),
      latestSession: vi.fn(),
      problems: vi.fn(),
      workouts: vi.fn(),
      modules: vi.fn(),
      paths: vi.fn(),
      cards: vi.fn(),
    },
  };
});

const PROGRESS: ProgressResponse = {
  hasActivity: true,
  solved: 40,
  total: 100,
  totalAttempts: 55,
  accuracy: 82,
  missed: 4,
  due: 3,
  byCategory: [
    { category: 'sql', solved: 8, total: 20 },
    { category: 'react', solved: 1, total: 12 },
  ],
  byDifficulty: [
    { difficulty: 'easy', solved: 20, total: 30 },
    { difficulty: 'medium', solved: 15, total: 40 },
    { difficulty: 'hard', solved: 5, total: 30 },
  ],
  byTag: [{ tag: 'reading', solved: 2, total: 12 }],
  recentAttempts: [
    {
      id: 1,
      slug: 'sql-anti-join',
      title: 'Rows with no match',
      verdict: 'correct',
      createdAt: '2026-08-02T08:00:00Z',
    },
  ],
  lastPracticedAt: '2026-08-02T08:00:00Z',
};

const SESSION: SessionResponse = {
  id: 1,
  createdAt: '2026-08-02T07:00:00Z',
  finishedAt: null,
  scope: {},
  items: [],
  total: 10,
  solved: 3,
  skipped: 0,
  remaining: 7,
  nextSlug: 'sql-anti-join',
  elapsedSeconds: 240,
};

function workout(slug: string, title: string, minutes: number): WorkoutSummary {
  return {
    slug,
    title,
    kind: 'bug-hunt',
    minutes,
    difficulty: 'medium',
    relevance: 'daily',
    stack: { server: 'Express' },
    summary: 'Nine seconds in production.',
    focus: [],
    checkpointCount: 3,
    bestCheckpointsPassed: null,
    lastAttemptedAt: null,
  };
}

const WORKOUTS = [
  workout('slow-orders', 'The slow orders list', 25),
  workout('json-parser', 'Build a JSON parser', 45),
];

const MODULES: ModuleSummary[] = [
  {
    slug: 'js-date',
    title: 'Dates in JavaScript',
    summary: 'What Date really stores.',
    order: 1,
    minutes: 20,
    stepCount: 12,
  },
];

const PATHS: PathSummary[] = [
  {
    slug: 'sql-that-does-not-lie',
    title: 'SQL that does not lie',
    question: 'Why does the count change?',
    summary: 'Joins, nulls and grouping.',
    order: 1,
    minutes: 60,
    stepCount: 8,
    provable: 5,
    done: 0,
  },
];

const CARDS = {
  cards: [
    { id: 'a', deck: 'joins', front: 'One', back: 'Two' },
    { id: 'b', deck: 'joins', front: 'Three', back: 'Four' },
  ],
  decks: [],
} as CardLibrary;

function mockApi(
  overrides: { progress?: ProgressResponse; session?: SessionResponse | null } = {}
): void {
  vi.mocked(api.progress).mockResolvedValue(overrides.progress ?? PROGRESS);
  vi.mocked(api.latestSession).mockResolvedValue({ session: overrides.session ?? null });
  vi.mocked(api.problems).mockResolvedValue([] as ProblemSummary[]);
  vi.mocked(api.workouts).mockResolvedValue(WORKOUTS);
  vi.mocked(api.modules).mockResolvedValue(MODULES);
  vi.mocked(api.paths).mockResolvedValue(PATHS);
  vi.mocked(api.cards).mockResolvedValue(CARDS);
}

function renderAt(path: string): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(cleanup);

/**
 * The routes carry the information architecture, so these assert what someone
 * lands on rather than how a component renders. Today owes exactly one call to
 * action per state of the morning; everything that reports lives elsewhere.
 */
describe('today', () => {
  it('offers one session to start, and says what is due', async () => {
    mockApi();
    renderAt('/');

    expect(await screen.findByRole('heading', { name: "Start today's session" })).toBeTruthy();
    expect(screen.getByText(/3 reviews are due and come first/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Start/ })).toBeTruthy();
  });

  it('resumes an unfinished session instead of offering a new one', async () => {
    mockApi({ session: SESSION });
    renderAt('/');

    expect(await screen.findByRole('heading', { name: '3 of 10 done' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Carry on/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Start$/ })).toBeNull();
  });

  it('acknowledges a session finished today rather than nagging for another', async () => {
    mockApi({
      session: { ...SESSION, finishedAt: new Date().toISOString(), remaining: 0, nextSlug: null },
    });
    renderAt('/');

    expect(await screen.findByRole('heading', { name: "Today's session is done" })).toBeTruthy();
  });

  it('welcomes a first run, and does not report numbers nobody has earned', async () => {
    mockApi({ progress: { ...PROGRESS, hasActivity: false, solved: 0, totalAttempts: 0 } });
    renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Hone' })).toBeTruthy();
    expect(screen.queryByText(/problems solved/)).toBeNull();
  });

  /** The durations are the content's own, so a tile never invents a number. */
  it('ranks the other formats by what they cost you', async () => {
    mockApi();
    renderAt('/');

    expect(await screen.findByText('2 cards')).toBeTruthy();
    expect(screen.getByText('20 min')).toBeTruthy();
    expect(screen.getByText('25–45 min')).toBeTruthy();
    expect(screen.getByText('60 min')).toBeTruthy();
  });

  /** A posture nobody can enter is a posture nobody practises. */
  it('gives the reading reps an entrance, scoped by tag', async () => {
    mockApi();
    renderAt('/');

    const entrance = await screen.findByRole('link', { name: /Code reading/ });
    expect(entrance.getAttribute('href')).toBe('/practice?tag=reading');
    expect(screen.getByText('12 reps')).toBeTruthy();
  });

  it('hides the entrance rather than linking at an empty queue', async () => {
    mockApi({ progress: { ...PROGRESS, byTag: [{ tag: 'reading', solved: 0, total: 0 }] } });
    renderAt('/');

    await screen.findByRole('heading', { name: "Start today's session" });
    expect(screen.queryByRole('link', { name: /Code reading/ })).toBeNull();
  });
});

describe('library', () => {
  it('opens on problems, and keeps every list one click apart', async () => {
    mockApi();
    renderAt('/library');

    expect(await screen.findByRole('heading', { name: 'Library' })).toBeTruthy();
    for (const label of ['Problems', 'Workouts', 'Modules', 'Essentials']) {
      expect(screen.getByRole('link', { name: label })).toBeTruthy();
    }
  });

  it('redirects the old list URLs into their tab', async () => {
    mockApi();
    renderAt('/workouts');

    expect(await screen.findByRole('link', { name: 'The slow orders list' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy();
  });

  it('leaves detail URLs alone, because a link to a workout is the workout', () => {
    mockApi();
    renderAt('/workouts/slow-orders');

    expect(screen.queryByRole('heading', { name: 'Library' })).toBeNull();
  });
});

describe('progress', () => {
  it('holds the numbers Today no longer opens with', async () => {
    mockApi();
    renderAt('/progress');

    expect(await screen.findByRole('heading', { name: 'Progress' })).toBeTruthy();
    expect(screen.getByText('40/100')).toBeTruthy();
    // Matched loosely: a coverage row puts its meter and count inside the link,
    // so the accessible name carries the score too ("React 1/12").
    expect(screen.getByRole('link', { name: /^React/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /3 due for review/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reset progress/ })).toBeTruthy();
  });
});
