import { describe, expect, it } from 'vitest';

import { report } from '../support/harness';

describe('a rate is read against the last one', () => {
  it('calls a drop past the tolerance a regression, and one inside it nothing', () => {
    const tuesday = report();

    expect(tuesday.regressions.slice().sort()).toEqual([
      'refund-window-days',
      'refuses-account-change',
    ]);
    // Both of these fell by a sixth against a tolerance of a fifth. A case set
    // this size cannot tell that from the assistant having a different morning,
    // and a gate that fails on it is a gate somebody turns off.
    expect(tuesday.regressions).not.toContain('refund-window-explained');
    expect(tuesday.regressions).not.toContain('triage-shape');
  });

  it('finds nothing wrong with the run the baseline was taken from', () => {
    const monday = report('monday');

    expect(monday.regressions).toEqual([]);
  });

  it('names a case with nothing to be read against rather than scoring it', () => {
    const tuesday = report();

    expect(tuesday.appeared, 'a case added since the baseline has nothing to compare with').toEqual(
      ['tone-check']
    );
    expect(tuesday.regressions).not.toContain('tone-check');
  });

  it('names a case the baseline has and the set no longer does', () => {
    const tuesday = report();

    expect(
      tuesday.disappeared,
      'a case that left the set quietly takes its score out of the total with it'
    ).toEqual(['legacy-greeting']);
  });

  it('fails the run for a regression, and for a case nobody can account for', () => {
    expect(report().ok, 'two cases regressed and one never ran').toBe(false);
    // A tolerance wide enough to swallow the regressions still leaves the case
    // nobody ran and the case that vanished, and neither is a pass.
    expect(report('tuesday', 1).ok).toBe(false);
    expect(report('tuesday', 1).regressions).toEqual([]);
  });
});
