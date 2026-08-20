import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WorkoutManifest, WorkoutWorkspaceFile } from '@hone/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// `DATA_DIR` is read once at import, so the scratch root has to be in the
// environment before the module graph under test is loaded. The imports are
// dynamic for that reason, and inside a hook rather than at the top level
// because this package compiles to CommonJS.
const DATA_ROOT = mkdtempSync(join(tmpdir(), 'hone-workspace-'));
process.env.HONE_DATA_DIR = DATA_ROOT;

let content: typeof import('./workout-content');
let workspace: typeof import('./workspace');

const ATTEMPT = 1;

beforeAll(async () => {
  content = await import('./workout-content');
  workspace = await import('./workspace');
});

afterAll(() => {
  rmSync(DATA_ROOT, { recursive: true, force: true });
});

/**
 * The tree carries the whole of `src/`, not the manifest's `editable` list.
 * Briefs across the library say "read it" about files that were never reachable:
 * a contract the client parses with, a fake whose semantics are the exercise. So
 * what is proved here is that every file arrives and that the flag, which is the
 * only thing standing between a read and a write, is right on all of them.
 */
describe('the workspace tree', () => {
  /** Materialise, read, and put the disk back. */
  function tree(manifest: WorkoutManifest): WorkoutWorkspaceFile[] {
    workspace.materialise(ATTEMPT, manifest);
    const files = workspace.readWorkspace(ATTEMPT, manifest);
    workspace.destroy(ATTEMPT);
    return files;
  }

  it('carries every file the workout ships, not only the editable ones', () => {
    const manifest = content
      .listManifests()
      .find((entry) => entry.slug === 'session-revocation-nestjs');
    if (!manifest) return;

    const files = tree(manifest);

    expect(files.length).toBeGreaterThan(manifest.editable.length);
    expect(files.map((file) => file.path)).toContain('src/server/auth.controller.ts');
    expect(files.every((file) => file.path.startsWith('src/'))).toBe(true);
    expect(files.every((file) => file.contents.length > 0)).toBe(true);
  });

  it('marks exactly the manifest list editable', () => {
    for (const manifest of content.listManifests()) {
      const editable = tree(manifest)
        .filter((file) => file.editable)
        .map((file) => file.path);

      expect(editable.sort()).toEqual([...manifest.editable].sort());
    }
  });

  it('opens on something you can type in', () => {
    for (const manifest of content.listManifests()) {
      expect(tree(manifest).some((file) => file.editable)).toBe(true);
    }
  });

  it('sorts a directory before a file at the same level', () => {
    const widest = [...content.listManifests()].sort(
      (a, b) => b.editable.length - a.editable.length
    )[0];
    if (!widest) return;

    const levels = tree(widest).map((file) => file.path.split('/').length);
    // Nothing shallow may follow something deep, which is what a tree renders as:
    // the loose files at a level come after the directories, never between them.
    expect([...levels].sort((a, b) => b - a)).toEqual(levels);
  });
});
