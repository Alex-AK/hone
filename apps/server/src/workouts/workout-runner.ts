import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import type {
  WorkoutCheckpoint,
  WorkoutCheckpointResult,
  WorkoutManifest,
  WorkoutRun,
  WorkoutTranscriptEntry,
} from '@hone/shared';

import { skipReason, unmetRequirements } from './requirements';
import { RUNTIME_MODULES } from './workout-content';

/** A workout run is a timed exercise. Well past that, something is wrong. */
const RUN_TIMEOUT_MS = 90_000;
const RESULTS_FILE = 'results.json';
/** Written by `hone/record.ts` in the workspace, one file per vitest worker. */
const TRANSCRIPT_DIR = '.transcript';
/**
 * Per checkpoint, and low on purpose. The panel is read while a timer runs, and
 * the whole run is persisted as the attempt's `lastRun`.
 */
const MAX_TRANSCRIPT_ENTRIES = 8;

/** The subset of vitest's JSON reporter we depend on. */
interface VitestJson {
  testResults?: {
    name?: string;
    assertionResults?: {
      status?: string;
      title?: string;
      fullName?: string;
      failureMessages?: string[];
    }[];
  }[];
}

export interface RunOptions {
  /** Run this checkpoint's suite alone. Everything else carries over. */
  only?: string;
  /** The previous run, which is where carried-over results come from. */
  previous?: WorkoutRun | null;
}

/**
 * All the runner wants of a manifest: what to run, what the workout asked for
 * in the way of a test run, and what it declared it needs. Taken together rather
 * than as options, so a caller cannot run a dated workout and quietly lose its
 * zone, or run one that needs a daemon and quietly lose the port it named.
 */
export type RunnableWorkout = Pick<WorkoutManifest, 'checkpoints' | 'requires' | 'testRun'>;

/**
 * Run the workspace's checkpoint suites and map them back onto the manifest.
 *
 * One suite per checkpoint, matched by file path, so a checkpoint's status is
 * simply "did every test in its file pass". That keeps partial progress
 * meaningful: at ten minutes you can see two of four green.
 *
 * `only` narrows the spawn to one suite, which is what makes iterating on a
 * single failure cheap. The others are not re-run and so cannot be reported as
 * fresh: they carry their previous result with `stale` set, or fall back to
 * not-run. A full run always replaces the whole picture.
 *
 * A workout that declared a requirement this machine does not meet returns
 * before vitest is spawned, with every checkpoint not-run and `skipped` saying
 * what is missing. Nothing ran, so nothing can be reported as passing.
 */
export async function runCheckpoints(
  workspace: string,
  workout: RunnableWorkout,
  options: RunOptions = {}
): Promise<WorkoutRun> {
  const checkpoints = workout.checkpoints;
  const only = options.only ?? null;
  const target = only ? checkpoints.find((checkpoint) => checkpoint.id === only) : undefined;
  const startedAt = Date.now();

  const missing = skipReason(await unmetRequirements(workout.requires));
  if (missing) {
    return {
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      only,
      passedCount: 0,
      // Not carried forward: a stale tick beside "this did not run" reads as a
      // result of the run that did not happen.
      checkpoints: checkpoints.map(notRun),
      crashed: null,
      skipped: missing,
    };
  }

  rmSync(join(workspace, RESULTS_FILE), { force: true });
  // Emptied rather than merged: a transcript from the previous run beside this
  // run's verdict is the same lie a stale tick would be.
  rmSync(join(workspace, TRANSCRIPT_DIR), { recursive: true, force: true });

  const outcome = await spawnVitest(workspace, workout, target?.testFile);
  const durationMs = Date.now() - startedAt;
  const ranAt = new Date().toISOString();

  const carried = new Map(
    (options.previous?.checkpoints ?? []).map((result) => [result.id, result])
  );
  const ranHere = (checkpoint: WorkoutCheckpoint): boolean => !only || checkpoint.id === only;
  const carry = (checkpoint: WorkoutCheckpoint): WorkoutCheckpointResult => {
    const before = carried.get(checkpoint.id);
    return before && before.status !== 'not-run' ? { ...before, stale: true } : notRun(checkpoint);
  };

  const report = readReport(workspace);
  if (!report) {
    return {
      ranAt,
      durationMs,
      only,
      passedCount: 0,
      checkpoints: checkpoints.map((checkpoint) =>
        ranHere(checkpoint) ? notRun(checkpoint) : carry(checkpoint)
      ),
      // Vitest writes no report when the suite cannot even be collected, which
      // is the common case mid-workout: a syntax error or a bad import.
      crashed: firstUsefulLine(outcome.stderr || outcome.stdout) ?? 'The suite could not run.',
      skipped: null,
    };
  }

  const transcripts = readTranscripts(workspace);
  const results = checkpoints.map((checkpoint) =>
    ranHere(checkpoint) ? summarise(checkpoint, report, transcripts) : carry(checkpoint)
  );
  return {
    ranAt,
    durationMs,
    only,
    checkpoints: results,
    passedCount: results.filter((result) => result.status === 'passed' && !result.stale).length,
    crashed: null,
    skipped: null,
  };
}

/**
 * What the spawn carries on the workout's behalf, all of it settled before the
 * process starts. That is the point for `TZ`, which is process state a suite
 * assigning it mid-run would hand to the next file the pool gives that worker,
 * and it is the point for the ports too: the value the suites connect to is the
 * value presence was checked on, decided once, in the one place that knows both.
 *
 * Nothing here knows what any of it is for. A port is a number the manifest
 * declared, not a Postgres, which is what keeps the runner out of the business
 * of the daemons a workout might want.
 */
function runEnv(workspace: string, workout: RunnableWorkout): NodeJS.ProcessEnv {
  const testRun = workout.testRun;

  return {
    ...process.env,
    // CI keeps vitest non-interactive and stops it watching.
    CI: 'true',
    NO_COLOR: '1',
    // Written every run, so an ambient value cannot reach a workout that asked
    // for nothing. The scaffold config reads this and merges it into both
    // projects; an absolute path saves it having to resolve one.
    HONE_SETUP_FILE: testRun?.setupFile ? join(workspace, testRun.setupFile) : '',
    // Every port the workout declared, in declaration order, and empty for the
    // workouts that declared none. Written every run for the same reason: a
    // stray `PGPORT` in somebody's shell is exactly how the port that was
    // checked and the port that gets connected to came apart in the first place.
    HONE_REQUIRED_PORTS: declaredPorts(workout).join(','),
    ...(testRun?.timezone ? { TZ: testRun.timezone } : {}),
  };
}

function declaredPorts(workout: RunnableWorkout): number[] {
  return (workout.requires ?? [])
    .map((requirement) => requirement.port)
    .filter((port): port is number => port !== undefined);
}

function spawnVitest(
  workspace: string,
  workout: RunnableWorkout,
  testFile?: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      join(RUNTIME_MODULES, '.bin', 'vitest'),
      [
        'run',
        '--reporter=json',
        `--outputFile=${RESULTS_FILE}`,
        // A positional argument is a path filter, so one suite runs alone.
        ...(testFile ? [testFile] : []),
      ],
      {
        cwd: workspace,
        env: runEnv(workspace, workout),
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      stderr += '\nThe run exceeded its time limit and was stopped.';
    }, RUN_TIMEOUT_MS);

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve({ stdout, stderr });
    });
  });
}

function readReport(workspace: string): VitestJson | null {
  try {
    return JSON.parse(readFileSync(join(workspace, RESULTS_FILE), 'utf8')) as VitestJson;
  } catch {
    return null;
  }
}

function summarise(
  checkpoint: WorkoutCheckpoint,
  report: VitestJson,
  transcripts: [string, WorkoutTranscriptEntry[]][]
): WorkoutCheckpointResult {
  // vitest reports absolute paths; the manifest holds workout-relative ones.
  const suite = report.testResults?.find((file) => file.name?.endsWith(checkpoint.testFile));
  const assertions = suite?.assertionResults ?? [];

  if (!suite || assertions.length === 0) return notRun(checkpoint);

  const passed = assertions.filter((assertion) => assertion.status === 'passed').length;
  const failure = assertions.find((assertion) => assertion.status === 'failed');
  const transcript = transcripts.find(([path]) => path.endsWith(checkpoint.testFile))?.[1];

  return {
    id: checkpoint.id,
    title: checkpoint.title,
    ...(checkpoint.hint ? { hint: checkpoint.hint } : {}),
    status: passed === assertions.length ? 'passed' : 'failed',
    testsPassed: passed,
    testsTotal: assertions.length,
    failure: failure ? describeFailure(failure) : null,
    ...(transcript?.length ? { transcript } : {}),
  };
}

interface RecordedLine extends WorkoutTranscriptEntry {
  testPath?: string;
}

/**
 * What the suites recorded, keyed by the absolute path vitest gave the suite and
 * matched back with the same `endsWith` that maps a suite to a checkpoint. It
 * cannot be a workspace-relative key: macOS hands `/var/folders/...` to the
 * runner and `/private/var/folders/...` to vitest, so the two agree on the tail
 * of the path and on nothing before it.
 *
 * Nothing here is trusted. These files are written by code running inside a
 * workspace, so a malformed line is skipped rather than allowed to take the run
 * report down with it.
 */
function readTranscripts(workspace: string): [string, WorkoutTranscriptEntry[]][] {
  const byPath = new Map<string, WorkoutTranscriptEntry[]>();
  const dir = join(workspace, TRANSCRIPT_DIR);

  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }

  for (const file of files.sort()) {
    let lines: string[];
    try {
      lines = readFileSync(join(dir, file), 'utf8').split('\n');
    } catch {
      continue;
    }

    for (const line of lines) {
      if (!line.trim()) continue;
      let parsed: RecordedLine;
      try {
        parsed = JSON.parse(line) as RecordedLine;
      } catch {
        continue;
      }

      const key = parsed.testPath;
      if (!key || typeof parsed.label !== 'string' || typeof parsed.body !== 'string') continue;

      const entries = byPath.get(key) ?? [];
      if (entries.length >= MAX_TRANSCRIPT_ENTRIES) continue;
      entries.push({
        label: parsed.label,
        body: parsed.body,
        truncated: parsed.truncated === true,
      });
      byPath.set(key, entries);
    }
  }

  return [...byPath];
}

function notRun(checkpoint: WorkoutCheckpoint): WorkoutCheckpointResult {
  return {
    id: checkpoint.id,
    title: checkpoint.title,
    ...(checkpoint.hint ? { hint: checkpoint.hint } : {}),
    status: 'not-run',
    testsPassed: 0,
    testsTotal: 0,
    failure: null,
  };
}

function describeFailure(assertion: { title?: string; failureMessages?: string[] }): string {
  const message = assertion.failureMessages?.[0] ?? '';
  // Keep the assertion and drop the stack: the frames are all inside vitest.
  const body = message
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith('at '))
    .slice(0, 6)
    .join('\n');
  return assertion.title ? `${assertion.title}\n${body}`.trim() : body.trim();
}

function firstUsefulLine(output: string): string | null {
  const line = output
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0 && !entry.startsWith('at '));
  return line ? line.slice(0, 400) : null;
}
