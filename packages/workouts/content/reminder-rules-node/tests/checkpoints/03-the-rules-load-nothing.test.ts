import { describe, expect, it, vi } from 'vitest';

import { clearLoaded, loadedModules } from '../../src/server/probe';

describe('the rules load nothing', () => {
  it('pulls in neither the store nor the clock when it is imported', async () => {
    // A fresh registry, so this measures what importing the rules pulls in
    // rather than what the other suites have already loaded between them.
    vi.resetModules();
    clearLoaded();

    await import('../../src/server/chase');
    const loaded = [...loadedModules()];

    expect(
      loaded,
      `importing chase.ts brought in ${loaded.join(' and ')}, which reaches outside the process`
    ).toEqual([]);
  });

  it('still exports something to call', async () => {
    vi.resetModules();

    const rules = (await import('../../src/server/chase')) as Record<string, unknown>;
    const exported = Object.values(rules).filter((value) => typeof value === 'function');

    expect(
      exported.length,
      'chase.ts exports no function, so nothing decides anything'
    ).toBeGreaterThan(0);
  });
});
