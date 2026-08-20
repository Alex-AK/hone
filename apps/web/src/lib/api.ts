import type {
  AttemptResponse,
  CardLibrary,
  CreateSessionRequest,
  HandbookPageDetail,
  HandbookSectionSummary,
  ModuleDetail,
  ModuleRunResponse,
  ModuleSummary,
  NextProblem,
  PathDetail,
  PathSummary,
  PracticeSchemaResponse,
  ProblemDetail,
  ProblemSummary,
  ProgressResponse,
  QueueMoveResponse,
  QueueScope,
  ResetAllResponse,
  RevealSolutionResponse,
  SessionResponse,
  WorkoutDetail,
  WorkoutFile,
  WorkoutRun,
  WorkoutSummary,
  WorkoutWorkspaceFile,
} from '@hone/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body: unknown = await response.json();
      const raw = (body as { message?: string | string[] }).message;
      if (Array.isArray(raw)) message = raw.join(', ');
      else if (typeof raw === 'string') message = raw;
    } catch {
      // Non-JSON error body — keep the status line.
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

const post = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

export const api = {
  progress: (): Promise<ProgressResponse> => request('/progress'),
  problems: (): Promise<ProblemSummary[]> => request('/problems'),
  problem: (slug: string): Promise<ProblemDetail> => request(`/problems/${slug}`),
  practiceSchema: (): Promise<PracticeSchemaResponse> => request('/practice-schema'),

  workouts: (): Promise<WorkoutSummary[]> => request('/workouts'),
  workout: (slug: string): Promise<WorkoutDetail> => request(`/workouts/${slug}`),
  startWorkout: (slug: string): Promise<WorkoutDetail> =>
    request(`/workouts/${slug}/start`, { method: 'POST' }),
  saveWorkoutFile: (
    slug: string,
    path: string,
    contents: string
  ): Promise<{ files: WorkoutWorkspaceFile[] }> =>
    request(`/workouts/${slug}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, contents }),
    }),
  resetWorkoutFile: (slug: string, path: string): Promise<{ files: WorkoutWorkspaceFile[] }> =>
    request(`/workouts/${slug}/files/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    }),
  /** `checkpoint` runs one suite alone; omit it to run them all. */
  runWorkout: (slug: string, checkpoint?: string): Promise<WorkoutRun> =>
    post(`/workouts/${slug}/run`, checkpoint ? { checkpoint } : {}),
  finishWorkout: (slug: string): Promise<WorkoutDetail> =>
    request(`/workouts/${slug}/finish`, { method: 'POST' }),
  revealWorkoutSolution: (slug: string): Promise<{ files: WorkoutFile[] }> =>
    request(`/workouts/${slug}/reveal-solution`, { method: 'POST' }),

  handbook: (): Promise<HandbookSectionSummary[]> => request('/handbook'),
  handbookPage: (section: string, slug: string): Promise<HandbookPageDetail> =>
    request(`/handbook/${section}/${slug}`),

  modules: (): Promise<ModuleSummary[]> => request('/modules'),
  module: (slug: string): Promise<ModuleDetail> => request(`/modules/${slug}`),
  runModuleStep: (slug: string, stepId: string, code: string): Promise<ModuleRunResponse> =>
    post(`/modules/${slug}/steps/${stepId}/run`, { code }),

  // One call for the whole card library, and read-only: cards are self-graded
  // and nothing is persisted, so there is no attempt to post.
  cards: (): Promise<CardLibrary> => request('/decks/cards'),

  paths: (): Promise<PathSummary[]> => request('/paths'),
  path: (slug: string): Promise<PathDetail> => request(`/paths/${slug}`),

  next: (
    after?: string,
    dir: 'next' | 'prev' = 'next',
    scope: QueueScope = {}
  ): Promise<{ next: NextProblem | null }> => {
    const params = scopeToParams(scope);
    if (after) params.set('after', after);
    if (dir !== 'next') params.set('dir', dir);
    return request(`/problems/next${suffix(params)}`);
  },

  attempt: (slug: string, answer: string): Promise<AttemptResponse> =>
    post(`/problems/${slug}/attempts`, { answer }),
  skip: (slug: string, scope: QueueScope = {}): Promise<QueueMoveResponse> =>
    post(`/problems/${slug}/skip${suffix(scopeToParams(scope))}`),
  resetAll: (clearHistory: boolean): Promise<ResetAllResponse> =>
    post('/progress/reset', { clearHistory }),

  createSession: (body: CreateSessionRequest): Promise<SessionResponse> => post('/sessions', body),
  activeSession: (): Promise<{ session: SessionResponse | null }> => request('/sessions/active'),
  latestSession: (): Promise<{ session: SessionResponse | null }> => request('/sessions/latest'),
  finishSession: (id: number): Promise<SessionResponse> => post(`/sessions/${id}/finish`),
  revealSolution: (slug: string): Promise<RevealSolutionResponse> =>
    post(`/problems/${slug}/reveal-solution`),
  reset: (slug: string): Promise<QueueMoveResponse> => post(`/problems/${slug}/reset`),
};

/**
 * One param per value, repeated: `?category=sql&category=react`. Express reads a
 * repeated param as an array and a single one as a string, and the server
 * normalises both, so the URL a link was written with years ago still works.
 */
export function scopeToParams(scope: QueueScope): URLSearchParams {
  const params = new URLSearchParams();
  for (const category of scope.category ?? []) params.append('category', category);
  for (const difficulty of scope.difficulty ?? []) params.append('difficulty', difficulty);
  if (scope.mode && scope.mode !== 'all') params.set('mode', scope.mode);
  if (scope.tag) params.set('tag', scope.tag);
  return params;
}

function suffix(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const queryKeys = {
  progress: ['progress'] as const,
  problems: ['problems'] as const,
  problem: (slug: string) => ['problem', slug] as const,
  next: (scope: QueueScope) => ['next-problem', scope] as const,
  practiceSchema: ['practice-schema'] as const,
  activeSession: ['session', 'active'] as const,
  latestSession: ['session', 'latest'] as const,
  workouts: ['workouts'] as const,
  workout: (slug: string) => ['workout', slug] as const,
  handbook: ['handbook'] as const,
  handbookPage: (section: string, slug: string) => ['handbook', section, slug] as const,
  modules: ['modules'] as const,
  module: (slug: string) => ['module', slug] as const,
  cards: ['cards'] as const,
  paths: ['paths'] as const,
  path: (slug: string) => ['path', slug] as const,
};
