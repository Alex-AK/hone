import type {
  UnmetRequirement,
  WorkoutAttemptRecord,
  WorkoutCheckpointResult,
  WorkoutDetail,
  WorkoutFile,
  WorkoutWorkspaceFile,
} from '@hone/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Play, RotateCcw, Square, XCircle } from 'lucide-react';
import * as React from 'react';
import { Link, useParams } from 'react-router-dom';

import { CodeEditor, type CodeEditorHandle } from '@/components/CodeEditor';
import { DiffView } from '@/components/DiffView';
import { FileTree } from '@/components/FileTree';
import { HandbookLinks } from '@/components/HandbookLinks';
import { Markdown } from '@/components/Markdown';
import { ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api, queryKeys } from '@/lib/api';
import { languageForPath } from '@/lib/editor-language';
import { cn } from '@/lib/utils';

export function WorkoutPage(): React.ReactElement {
  const { slug = '' } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();

  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.workout(slug),
    queryFn: () => api.workout(slug),
    enabled: slug.length > 0,
  });

  if (isPending) return <LoadingState label="Loading workout…" />;
  if (error) return <ErrorState error={error} />;

  return data.attempt ? (
    <WorkoutIde key={data.attempt.id} slug={slug} detail={data} />
  ) : (
    <WorkoutIntro
      detail={data}
      onStart={async () => {
        const started = await api.startWorkout(slug);
        queryClient.setQueryData(queryKeys.workout(slug), started);
      }}
    />
  );
}

function WorkoutIntro({
  detail,
  onStart,
}: {
  detail: WorkoutDetail;
  onStart: () => Promise<void>;
}): React.ReactElement {
  const [starting, setStarting] = React.useState(false);
  const blocked = detail.unmet.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/library/workouts" className="text-sm text-muted-foreground hover:underline">
          ← Workouts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{detail.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(detail.stack).map(([part, value]) => (
            <Badge key={part} variant="muted" title={part}>
              {value}
            </Badge>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <Markdown>{detail.brief}</Markdown>
          <HandbookLinks slug={detail.slug} className="mt-6 border-t pt-4" />
        </CardContent>
      </Card>

      {blocked && <MissingRequirements unmet={detail.unmet} />}

      <div className="flex items-center gap-3">
        <Button
          disabled={starting || blocked}
          onClick={() => {
            setStarting(true);
            void onStart().finally(() => setStarting(false));
          }}
        >
          <Play />
          Start the {detail.minutes} minute clock
        </Button>
        <span className="text-sm text-muted-foreground">
          {detail.checkpointCount} checkpoints. Partial progress counts.
        </span>
      </div>

      <AttemptHistory history={detail.history} checkpointCount={detail.checkpointCount} />
    </div>
  );
}

/**
 * What the earlier attempts came to, on the page where the decision to do it
 * again gets made. Time to green is the column, not time in the workout: the
 * clock keeps running through the diff and the reference, and reading those is
 * the part of an attempt that is deliberately not timed.
 */
function AttemptHistory({
  history,
  checkpointCount,
}: {
  history: WorkoutAttemptRecord[];
  checkpointCount: number;
}): React.ReactElement {
  if (history.length === 0) return <></>;

  const timed = history
    .map((attempt) => attempt.secondsToGreen)
    .filter((seconds): seconds is number => seconds !== null);
  const best = timed.length > 0 ? Math.min(...timed) : null;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="font-medium">Earlier attempts</h2>
        <ul className="space-y-2 text-sm">
          {history.map((attempt) => (
            <li key={attempt.startedAt} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-muted-foreground">{shortDate(attempt.startedAt)}</span>
              <span className="font-mono tabular-nums">
                {attempt.secondsToGreen === null
                  ? '—'
                  : `${clock(attempt.secondsToGreen)} to green`}
              </span>
              <span className="text-muted-foreground">
                {attempt.checkpointsPassed} of {checkpointCount} checkpoints
              </span>
              {attempt.solutionViewed && (
                <span className="text-muted-foreground">read the reference</span>
              )}
            </li>
          ))}
        </ul>
        {best !== null && history.length > 1 && (
          <p className="text-xs text-muted-foreground">Fastest so far: {clock(best)}.</p>
        )}
      </CardContent>
    </Card>
  );
}

function clock(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  return `${String(mm)}:${ss}`;
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * The workout is fine and this machine is not, so this reads as a shopping list
 * rather than an error: what is missing, what it is for, and the line to run.
 */
function MissingRequirements({ unmet }: { unmet: UnmetRequirement[] }): React.ReactElement {
  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="space-y-3 p-5 text-sm text-amber-900">
        <p className="font-medium">
          This workout needs something your machine does not have, so it cannot start here.
        </p>
        {unmet.map((requirement) => (
          <div key={`${requirement.binary ?? ''}:${requirement.port ?? ''}`} className="space-y-1">
            <p>{requirement.message}</p>
            <p className="text-amber-800">{requirement.reason}</p>
            <pre className="overflow-x-auto rounded bg-amber-100 p-2 text-xs">
              {requirement.install}
            </pre>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function WorkoutIde({ slug, detail }: { slug: string; detail: WorkoutDetail }): React.ReactElement {
  const queryClient = useQueryClient();
  const attempt = detail.attempt;
  const editorRef = React.useRef<CodeEditorHandle>(null);

  const [files, setFiles] = React.useState<WorkoutWorkspaceFile[]>(attempt?.files ?? []);
  // The tree opens on work rather than on context, so the landing file is the
  // first editable one and not the alphabetically first thing in `src/`.
  const [activePath, setActivePath] = React.useState(
    (files.find((file) => file.editable) ?? files[0])?.path ?? ''
  );
  const [run, setRun] = React.useState(attempt?.lastRun ?? null);
  // Three ways to look at the same file. `diff` is the one the review after the
  // timer wants: reading two files in turn is not comparing them.
  const [view, setView] = React.useState<'mine' | 'diff' | 'reference'>('mine');
  const [solution, setSolution] = React.useState<WorkoutFile[] | null>(detail.solution);

  const active = files.find((file) => file.path === activePath) ?? files[0];
  const editable = active?.editable ?? false;
  // The reference only ships the files it changes, so a missing one is a real
  // answer ("this file is already right") and not an empty editor.
  const reference = solution?.find((file) => file.path === activePath)?.contents ?? null;
  // A read-only file has no version of yours to diff against, so switching to
  // one drops back to plain reading rather than carrying the last view over.
  const shownView = editable ? view : 'mine';
  const shown =
    shownView === 'reference' ? (reference ?? active?.contents ?? '') : (active?.contents ?? '');

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.workouts });
  }, [queryClient]);

  // Save on a pause in typing. The workspace on disk is the source of truth for
  // the runner, so an unsaved buffer would grade the previous version.
  const pending = React.useRef<Map<string, string>>(new Map());
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const queued = [...pending.current.entries()];
      pending.current.clear();
      for (const [path, contents] of queued) {
        void api.saveWorkoutFile(slug, path, contents);
      }
    }, 400);
    return () => clearTimeout(timer);
  });

  function edit(contents: string): void {
    if (!active || !active.editable || view !== 'mine') return;
    setFiles((current) =>
      current.map((file) => (file.path === active.path ? { ...file, contents } : file))
    );
    pending.current.set(active.path, contents);
  }

  const runMutation = useMutation({
    mutationFn: async (checkpoint?: string) => {
      // Flush anything still in the debounce before grading.
      for (const [path, contents] of pending.current.entries()) {
        await api.saveWorkoutFile(slug, path, contents);
      }
      pending.current.clear();
      return api.runWorkout(slug, checkpoint);
    },
    onSuccess: async (result) => {
      setRun(result);
      if (result.passedCount === detail.checkpointCount) {
        const revealed = await api.revealWorkoutSolution(slug);
        setSolution(revealed.files);
      }
      await refresh();
    },
  });

  const finishMutation = useMutation({
    mutationFn: () => api.finishWorkout(slug),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.workout(slug), updated);
      await refresh();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/library/workouts" className="text-sm text-muted-foreground hover:underline">
          ← Workouts
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">{detail.title}</h1>
        {attempt && <Timer startedAt={attempt.startedAt} minutes={detail.minutes} />}
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => runMutation.mutate(undefined)} disabled={runMutation.isPending}>
            <Play />
            {runMutation.isPending ? 'Running…' : 'Run checkpoints'}
          </Button>
          <Button
            variant="outline"
            onClick={() => finishMutation.mutate()}
            disabled={finishMutation.isPending}
          >
            <Square />
            Finish
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-3 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <FileTree files={files} activePath={activePath} onSelect={setActivePath} />

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2 border-b pb-1">
              <span className="font-mono text-xs text-muted-foreground">{activePath}</span>
              <div className="ml-auto flex items-center gap-2">
                {editable && solution && <ViewSwitch value={view} onChange={setView} />}
                {editable && (
                  <Button
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={view !== 'mine'}
                    onClick={() => {
                      void api.resetWorkoutFile(slug, activePath).then((result) => {
                        setFiles(result.files);
                      });
                    }}
                  >
                    <RotateCcw />
                    Reset file
                  </Button>
                )}
              </div>
            </div>

            {!editable && (
              <p className="text-xs text-muted-foreground">
                This file is part of the workout and cannot be changed. Read it.
              </p>
            )}

            {editable && view === 'reference' && (
              <p className="text-xs text-amber-700">
                {reference === null
                  ? 'The reference leaves this file alone, so this is still your code.'
                  : 'Showing the reference implementation. Edits here are not saved.'}
              </p>
            )}

            {shownView === 'diff' ? (
              <DiffView mine={active?.contents ?? ''} reference={reference} />
            ) : (
              active && (
                <CodeEditor
                  key={`${activePath}-${shownView}`}
                  ref={editorRef}
                  value={shown}
                  onChange={edit}
                  language={languageForPath(activePath)}
                  placeholder=""
                  onSubmit={() => runMutation.mutate(undefined)}
                  minHeight="34rem"
                  readOnly={!editable || shownView === 'reference'}
                />
              )
            )}
          </div>
        </div>

        <div className="space-y-4">
          <CheckpointPanel
            results={run?.checkpoints ?? notRunYet(detail)}
            crashed={run?.crashed ?? null}
            skipped={run?.skipped ?? null}
            running={runMutation.isPending}
            onRun={(checkpoint) => runMutation.mutate(checkpoint)}
          />
          <TranscriptPanel results={run?.checkpoints ?? []} />
          <Card>
            <CardContent className="max-h-[22rem] overflow-y-auto p-5 text-sm">
              <Markdown>{detail.brief}</Markdown>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function notRunYet(detail: WorkoutDetail): WorkoutCheckpointResult[] {
  return detail.checkpoints.map((checkpoint) => ({
    id: checkpoint.id,
    title: checkpoint.title,
    ...(checkpoint.hint ? { hint: checkpoint.hint } : {}),
    status: 'not-run' as const,
    testsPassed: 0,
    testsTotal: 0,
    failure: null,
  }));
}

/**
 * What the suites handed over while they ran, beside the verdict that came out
 * of them. A checkpoint answers yes or no, and where the subject is a shape —
 * the body an endpoint sent, the rows a page of a feed held, the markup a
 * component rendered — a no on its own names a path into something nobody can
 * look at.
 *
 * This is a transcript and nothing else. Everything here is text a suite already
 * produced, printed as it arrived. Nothing is re-run, and no component is
 * rendered here: that would be a second runtime, and it is the line this panel
 * exists on the safe side of.
 */
function TranscriptPanel({ results }: { results: WorkoutCheckpointResult[] }): React.ReactElement {
  const recorded = results.filter((result) => result.transcript?.length);
  if (recorded.length === 0) return <></>;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h2 className="font-medium">What the run produced</h2>
        {recorded.map((result) => (
          <div key={result.id} className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {result.title}
              {result.stale && ' · not re-run just now'}
            </p>
            {(result.transcript ?? []).map((entry, index) => (
              <div key={`${entry.label}-${String(index)}`} className="space-y-1">
                <p className="text-xs font-medium">{entry.label}</p>
                <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed">
                  {entry.body}
                </pre>
                {entry.truncated && (
                  <p className="text-xs text-muted-foreground">Cut off at 4,000 characters.</p>
                )}
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const VIEWS = [
  { value: 'mine', label: 'Mine' },
  { value: 'diff', label: 'Diff' },
  { value: 'reference', label: 'Reference' },
] as const;

function ViewSwitch({
  value,
  onChange,
}: {
  value: 'mine' | 'diff' | 'reference';
  onChange: (next: 'mine' | 'diff' | 'reference') => void;
}): React.ReactElement {
  return (
    <div className="flex items-center rounded-md border p-0.5">
      {VIEWS.map((entry) => (
        <button
          key={entry.value}
          type="button"
          onClick={() => onChange(entry.value)}
          className={cn(
            'rounded px-2 py-0.5 text-xs transition-colors',
            value === entry.value
              ? 'bg-secondary font-medium text-secondary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

function CheckpointPanel({
  results,
  crashed,
  skipped,
  running,
  onRun,
}: {
  results: WorkoutCheckpointResult[];
  crashed: string | null;
  skipped: string | null;
  running: boolean;
  onRun: (checkpoint: string) => void;
}): React.ReactElement {
  const passed = results.filter((result) => result.status === 'passed').length;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">Checkpoints</h2>
          <span className="text-sm text-muted-foreground">
            {passed} of {results.length}
          </span>
        </div>

        {crashed && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <p className="font-medium">The suite could not run.</p>
            <pre className="mt-1 break-words whitespace-pre-wrap">{crashed}</pre>
          </div>
        )}

        {/* Amber, not red, and never silence: nothing ran, so every checkpoint
            below is not-run rather than failed. */}
        {skipped && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-medium">Nothing ran.</p>
            <p className="mt-1">{skipped}</p>
          </div>
        )}

        <ol className="space-y-3">
          {results.map((result) => (
            <li key={result.id} className="group space-y-1">
              <div className="flex items-start gap-2">
                {result.status === 'passed' ? (
                  <CheckCircle2
                    className={cn(
                      'mt-0.5 size-4 shrink-0 text-emerald-600',
                      result.stale && 'opacity-50'
                    )}
                  />
                ) : result.status === 'failed' ? (
                  <XCircle
                    className={cn(
                      'mt-0.5 size-4 shrink-0 text-rose-600',
                      result.stale && 'opacity-50'
                    )}
                  />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <p className={cn('text-sm', result.stale && 'text-muted-foreground')}>
                    {result.title}
                  </p>
                  {result.stale ? (
                    <p className="text-xs text-muted-foreground">Not re-run just now.</p>
                  ) : (
                    result.testsTotal > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {result.testsPassed} of {result.testsTotal} assertions
                      </p>
                    )
                  )}
                </div>
                {/* One suite instead of the whole file set: the difference
                    between iterating on a failure and waiting for it. */}
                <button
                  type="button"
                  disabled={running}
                  onClick={() => onRun(result.id)}
                  className="ml-auto rounded px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 disabled:opacity-0"
                  title={`Run ${result.title} on its own`}
                >
                  Run
                </button>
              </div>
              {result.status === 'failed' && result.failure && (
                <pre className="ml-6 overflow-x-auto rounded bg-muted p-2 text-[11px] leading-relaxed whitespace-pre-wrap">
                  {result.failure}
                </pre>
              )}
              {result.status === 'failed' && result.hint && (
                <p className="ml-6 text-xs text-muted-foreground">{result.hint}</p>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/** Counts up, and keeps going past the target rather than nagging. */
function Timer({ startedAt, minutes }: { startedAt: string; minutes: number }): React.ReactElement {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const over = elapsed > minutes * 60;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <span
      className={cn(
        'rounded-md border px-2 py-0.5 font-mono text-sm tabular-nums',
        over ? 'border-amber-200 bg-amber-50 text-amber-800' : 'text-muted-foreground'
      )}
      title={over ? `Past the ${minutes} minute target — keep going and wrap it up` : undefined}
    >
      {mm}:{ss} / {minutes}:00
    </span>
  );
}
