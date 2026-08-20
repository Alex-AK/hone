import { beforeEach, describe, expect, it } from 'vitest';

import { setNow } from '../../src/server/clock';
import { runNightly } from '../../src/server/nightly';
import { accesses, clearAccesses } from '../../src/server/probe';
import { chaseRun } from '../../src/server/run';
import { reset } from '../../src/server/store';

const RULES = 'server/chase.ts';

beforeEach(() => {
  reset();
  setNow('2025-05-20T09:00:00.000Z');
  clearAccesses();
});

/**
 * What was fetched with the rules somewhere under it, by name and without the
 * arguments: twenty calls to the same three functions is one thing to fix.
 */
function reachedFromTheRules(): string[] {
  const names = new Set<string>();
  for (const access of accesses()) {
    if (access.frames.includes(RULES)) names.add(access.name.replace(/\(.*\)$/, '()'));
  }
  return [...names].sort();
}

describe('nothing is fetched while the decision is being made', () => {
  it('builds the plan without the rules asking for anything', () => {
    chaseRun();

    expect(accesses().length, 'the run fetched nothing at all').toBeGreaterThan(0);
    expect(reachedFromTheRules(), `called with ${RULES} on the stack`).toEqual([]);
  });

  it('sends the night without the rules asking for anything', () => {
    runNightly();

    expect(reachedFromTheRules(), `called with ${RULES} on the stack`).toEqual([]);
  });
});
