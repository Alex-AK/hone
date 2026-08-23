import { describe, expect, it } from 'vitest';

import { caseNamed, report } from '../support/harness';

describe('a case is a rate, not a verdict', () => {
  it('reads every answer that was recorded, not the first one', () => {
    const tuesday = report();

    expect(caseNamed(tuesday, 'refund-window-days')).toMatchObject({
      passed: 2,
      rate: 0.5,
      samples: 4,
    });
    expect(
      caseNamed(tuesday, 'refund-window-explained'),
      'the same input has six recorded answers and five of them are right'
    ).toMatchObject({ passed: 5, samples: 6 });
  });

  it('scores a case that got everything right at one, and Monday at one throughout', () => {
    const monday = report('monday');

    for (const result of monday.cases) {
      expect(result.rate, `${result.id} did not score 1 on the run the baseline came from`).toBe(1);
    }
    expect(monday.rate).toBe(1);
  });

  it('counts a case once, however many times it was run', () => {
    const tuesday = report();

    // Six cases ran, on four to six answers each. The mean of the case rates,
    // not of the answers: sampling one case more is not a reason for it to
    // count more than the case beside it.
    const mean =
      tuesday.cases.reduce((total, result) => total + result.rate, 0) / tuesday.cases.length;
    expect(tuesday.rate).toBeCloseTo(mean, 10);
    expect(tuesday.rate, 'the overall rate is the mean of the case rates').toBeCloseTo(0.8194, 3);
  });

  it('does not score a case nobody ran', () => {
    const tuesday = report();

    expect(
      tuesday.notRun,
      'a case with no answers scored nothing, which is not the same as scoring zero'
    ).toEqual(['delivery-estimate']);
    expect(tuesday.cases.map((result) => result.id)).not.toContain('delivery-estimate');
    expect(Number.isNaN(tuesday.rate), 'a rate over no answers reached the total').toBe(false);
  });
});
