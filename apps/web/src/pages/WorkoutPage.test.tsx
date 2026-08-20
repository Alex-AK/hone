import type { WorkoutCheckpointResult, WorkoutDetail } from '@hone/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { WorkoutPage } from '@/pages/WorkoutPage';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      workout: vi.fn(),
      handbook: vi.fn(),
      resetWorkoutFile: vi.fn(),
      saveWorkoutFile: vi.fn(),
      runWorkout: vi.fn(),
    },
  };
});

/**
 * Two directories and a file the manifest does not name, which is the shape the
 * tree exists for: `contract.ts` is read-only and the brief tells you to read it.
 */
const IN_PROGRESS: WorkoutDetail = {
  slug: 'support-board-express',
  title: 'The board the client already knows how to draw',
  kind: 'feature',
  minutes: 25,
  difficulty: 'medium',
  relevance: 'daily',
  stack: { server: 'express' },
  summary: 'The board draws four columns instead of five.',
  focus: ['api design'],
  checkpointCount: 1,
  bestCheckpointsPassed: null,
  lastAttemptedAt: null,
  brief: 'Fix the board.',
  editable: ['src/server/board.ts'],
  checkpoints: [{ id: 'shape', title: 'The payload matches the contract', testFile: 't.test.ts' }],
  solution: null,
  unmet: [],
  history: [],
  attempt: {
    id: 7,
    slug: 'support-board-express',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lastRun: null,
    files: [
      { path: 'src/client/contract.ts', contents: 'export const parseBoard = 1;', editable: false },
      { path: 'src/server/board.ts', contents: 'export const board = 1;', editable: true },
      { path: 'src/server/db.ts', contents: 'export const db = 1;', editable: false },
    ],
  },
};

beforeEach(() => {
  vi.mocked(api.workout).mockResolvedValue(IN_PROGRESS);
  vi.mocked(api.handbook).mockResolvedValue([]);
});

afterEach(cleanup);

function renderPage(detail: WorkoutDetail = IN_PROGRESS): ReturnType<typeof render> {
  vi.mocked(api.workout).mockResolvedValue(detail);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[`/workouts/${detail.slug}`]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/workouts/:slug" element={<WorkoutPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * The workspace ships files the manifest does not name, and briefs across the
 * library tell you to read several of them. The old tab strip listed only the
 * editable ones, so those files were materialised, tested against and
 * unreachable.
 */
describe('the workout file tree', () => {
  it('lists the files the manifest does not name', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: /contract\.ts/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /db\.ts/ })).toBeTruthy();
  });

  it('opens on a file you can edit, not on the first one in the tree', async () => {
    const { container } = renderPage();

    await screen.findByRole('button', { name: /board\.ts/ });
    expect(container.querySelector('[aria-current="true"]')?.textContent).toContain('board.ts');
  });

  it('nests the directories rather than flattening them', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: /^client$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^server$/ })).toBeTruthy();
  });

  it('collapses a directory', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /^client$/ }));

    expect(screen.queryByRole('button', { name: /contract\.ts/ })).toBeNull();
  });
});

/**
 * The transcript is text a suite produced, printed. The tests below are as much
 * about what it is not: no component is mounted, nothing is re-run, and a
 * workout that recorded nothing gets no panel rather than an empty one.
 */
describe('what the run produced', () => {
  function withRun(transcript?: WorkoutCheckpointResult['transcript']): WorkoutDetail {
    return {
      ...IN_PROGRESS,
      attempt: {
        ...IN_PROGRESS.attempt!,
        lastRun: {
          ranAt: new Date().toISOString(),
          durationMs: 900,
          only: null,
          passedCount: 0,
          crashed: null,
          skipped: null,
          checkpoints: [
            {
              id: 'shape',
              title: 'The payload matches the contract',
              status: 'failed',
              testsPassed: 0,
              testsTotal: 1,
              failure: 'columns.0.cards.3.updatedAt: expected string',
              ...(transcript ? { transcript } : {}),
            },
          ],
        },
      },
    };
  }

  it('prints what the checkpoint recorded', async () => {
    renderPage(
      withRun([
        { label: 'one card, exactly as it was sent', body: '{ "id": 94 }', truncated: false },
      ])
    );

    expect(await screen.findByText('What the run produced')).toBeTruthy();
    expect(screen.getByText('one card, exactly as it was sent')).toBeTruthy();
    expect(screen.getByText(/"id": 94/)).toBeTruthy();
  });

  it('says when the run produced more than it is showing', async () => {
    renderPage(withRun([{ label: 'the board', body: '{', truncated: true }]));

    expect(await screen.findByText(/Cut off at 4,000 characters/)).toBeTruthy();
  });

  it('shows no panel at all for a checkpoint that recorded nothing', async () => {
    renderPage(withRun());

    await screen.findByText('The payload matches the contract');
    expect(screen.queryByText('What the run produced')).toBeNull();
  });
});

/**
 * The second and third runs are the point of a workout, so the page you decide
 * to do it again from is the page that has to say what the earlier ones came to.
 */
describe('earlier attempts', () => {
  function cold(history: WorkoutDetail['history']): WorkoutDetail {
    return { ...IN_PROGRESS, attempt: null, history };
  }

  it('says nothing at all before the first attempt', async () => {
    renderPage(cold([]));

    await screen.findByRole('button', { name: /Start the/ });
    expect(screen.queryByText('Earlier attempts')).toBeNull();
  });

  it('reports time to green rather than time in the workout', async () => {
    renderPage(
      cold([
        {
          startedAt: '2026-08-10T09:00:00.000Z',
          finishedAt: '2026-08-10T09:40:00.000Z',
          checkpointsPassed: 1,
          secondsToGreen: 754,
          solutionViewed: false,
        },
      ])
    );

    // 12:34, not the 40 minutes the attempt was open for.
    expect(await screen.findByText(/12:34 to green/)).toBeTruthy();
  });

  it('shows an attempt that never went green as one, and names the fastest', async () => {
    renderPage(
      cold([
        {
          startedAt: '2026-08-11T09:00:00.000Z',
          finishedAt: '2026-08-11T09:20:00.000Z',
          checkpointsPassed: 0,
          secondsToGreen: null,
          solutionViewed: true,
        },
        {
          startedAt: '2026-08-10T09:00:00.000Z',
          finishedAt: '2026-08-10T09:40:00.000Z',
          checkpointsPassed: 1,
          secondsToGreen: 754,
          solutionViewed: false,
        },
      ])
    );

    expect(await screen.findByText('read the reference')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText(/Fastest so far: 12:34/)).toBeTruthy();
  });
});

describe('a read-only file', () => {
  it('says why it cannot be edited, and offers no reset', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /contract\.ts/ }));

    expect(screen.getByText(/cannot be changed/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Reset file/ })).toBeNull();
  });

  it('leaves the editable file its reset button', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: /Reset file/ })).toBeTruthy();
  });

  it('never writes one back to the server', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /contract\.ts/ }));
    await screen.findByText(/cannot be changed/);

    expect(api.saveWorkoutFile).not.toHaveBeenCalled();
  });
});
