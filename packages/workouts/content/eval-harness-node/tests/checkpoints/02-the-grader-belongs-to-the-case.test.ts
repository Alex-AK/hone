import { describe, expect, it } from 'vitest';

import { caseNamed, report } from '../support/harness';

describe('the grader belongs to the case', () => {
  it('lets a right answer through in wording nobody wrote down', () => {
    const tuesday = report();

    // Six ways of saying it, five of them right, and no two of them the same
    // string. A case set graded by comparing strings scores this at nothing.
    const explained = caseNamed(tuesday, 'refund-window-explained');
    expect(explained.passed).toBe(5);
    expect(
      caseNamed(tuesday, 'restock-fee'),
      '£24, 24 and "24 pounds" are one answer'
    ).toMatchObject({ passed: 4, rate: 1 });
  });

  it('holds the case that really does want one exact answer to it', () => {
    const tuesday = report();

    const days = caseNamed(tuesday, 'refund-window-days');
    expect(days.rate, '"Thirty" and "30 days" are not the number alone').toBe(0.5);
    expect(days.failures.map((failure) => failure.output)).toEqual(['Thirty', '30 days']);
  });

  it('reads the JSON case for its shape', () => {
    const tuesday = report();

    const shape = caseNamed(tuesday, 'triage-shape');
    expect(shape.samples).toBe(6);
    // Five of the six are the right shape. One of those five calls a furious
    // customer pleased, and this grader has nothing to say about that: it
    // checks the shape and never the answer, which is a limit of the grader
    // rather than of the run.
    expect(shape.passed).toBe(5);
    expect(shape.failures).toHaveLength(1);
    expect(shape.failures[0]?.why).toMatch(/JSON/);
  });
});
