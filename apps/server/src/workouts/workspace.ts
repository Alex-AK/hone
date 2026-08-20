import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';

import type { WorkoutFile, WorkoutManifest, WorkoutWorkspaceFile } from '@hone/shared';

import { DATA_DIR } from '../common/paths';
import { RUNTIME_MODULES, SCAFFOLD_DIR, workoutDir } from './workout-content';

const WORKSPACES_DIR = join(DATA_DIR, 'workouts');

export function workspacePath(attemptId: number): string {
  return join(WORKSPACES_DIR, String(attemptId));
}

/**
 * Lay out a runnable copy of the workout:
 *
 *   <workspace>/src          the starting files, editable
 *   <workspace>/tests        the checkpoint suites, read-only
 *   <workspace>/node_modules symlink to the workouts package
 *
 * `tests/` is copied whole, which is how a `testRun.setupFile` arrives: the
 * runner resolves it against the workspace at the path the manifest names.
 *
 * The symlink is the whole trick. pnpm has already built that directory from
 * `packages/workouts/package.json`, so the workspace resolves the real
 * drizzle-orm, the real testing-library, without an install per attempt.
 */
export function materialise(attemptId: number, manifest: WorkoutManifest): void {
  const workspace = workspacePath(attemptId);
  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(workspace, { recursive: true });

  const source = workoutDir(manifest.slug);
  cpSync(SCAFFOLD_DIR, workspace, { recursive: true });
  cpSync(join(source, 'files'), join(workspace, 'src'), { recursive: true });
  cpSync(join(source, 'tests'), join(workspace, 'tests'), { recursive: true });

  const modules = join(workspace, 'node_modules');
  if (!existsSync(modules)) {
    symlinkSync(RUNTIME_MODULES, modules, 'dir');
  }
}

export function destroy(attemptId: number): void {
  rmSync(workspacePath(attemptId), { recursive: true, force: true });
}

/**
 * The workout's own source tree, which is `src/` and nothing else: the tests,
 * the config and node_modules stay out of the editor. Everything under it is
 * readable and only the manifest's `editable` list is writable, because a brief
 * that says "read `contract.ts`, it is the specification" is describing a file
 * the reader has to be able to open.
 */
export function readWorkspace(
  attemptId: number,
  manifest: WorkoutManifest
): WorkoutWorkspaceFile[] {
  const workspace = workspacePath(attemptId);
  const editable = new Set(manifest.editable);
  const paths = new Set([...walk(join(workspace, 'src'), 'src'), ...manifest.editable]);

  return [...paths].sort(byTree).map((path) => ({
    path,
    editable: editable.has(path),
    contents: existsSync(join(workspace, path)) ? readFileSync(join(workspace, path), 'utf8') : '',
  }));
}

function walk(dir: string, prefix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${prefix}/${entry.name}`;
    return entry.isDirectory() ? walk(join(dir, entry.name), path) : [path];
  });
}

/** Directory before file at each level, which is the order a tree renders in. */
function byTree(a: string, b: string): number {
  const left = a.split('/');
  const right = b.split('/');

  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const one = left[i] ?? '';
    const other = right[i] ?? '';
    if (one === other) continue;
    const oneIsDir = i < left.length - 1;
    const otherIsDir = i < right.length - 1;
    if (oneIsDir !== otherIsDir) return oneIsDir ? -1 : 1;
    return one.localeCompare(other);
  }
  return left.length - right.length;
}

export function writeEditable(
  attemptId: number,
  manifest: WorkoutManifest,
  path: string,
  contents: string
): void {
  if (!manifest.editable.includes(path)) {
    throw new Error(`"${path}" is not an editable file in this workout`);
  }

  const workspace = workspacePath(attemptId);
  const target = join(workspace, path);
  assertInside(workspace, target);

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, 'utf8');
}

/** Reset one file back to how the workout shipped it. */
export function restoreEditable(manifest: WorkoutManifest, path: string): string {
  const relativeToFiles =
    path.startsWith(`src${sep}`) || path.startsWith('src/') ? path.slice(4) : path;
  return readFileSync(join(workoutDir(manifest.slug), 'files', relativeToFiles), 'utf8');
}

/** The reference implementation, mapped onto the same editor paths. */
export function readSolution(manifest: WorkoutManifest): WorkoutFile[] {
  const solutionRoot = join(workoutDir(manifest.slug), 'solution');
  return manifest.editable
    .map((path) => {
      const withinSolution = join(solutionRoot, path.replace(/^src[\\/]/, ''));
      return existsSync(withinSolution)
        ? { path, contents: readFileSync(withinSolution, 'utf8') }
        : null;
    })
    .filter((file): file is WorkoutFile => file !== null);
}

/**
 * Paths come from the client, so a `../` in one would otherwise write anywhere
 * on disk. The manifest allowlist already blocks this; this is the second lock.
 */
function assertInside(root: string, target: string): void {
  const rel = relative(normalize(root), normalize(target));
  if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
    throw new Error('Refusing to write outside the workspace');
  }
}
