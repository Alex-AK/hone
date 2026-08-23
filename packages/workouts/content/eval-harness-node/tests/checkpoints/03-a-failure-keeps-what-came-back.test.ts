import { describe, expect, it } from 'vitest';

import { caseNamed, report } from '../support/harness';

describe('a failure keeps what came back', () => {
  it('keeps every answer that did not pass, as it came back', () => {
    const tuesday = report();

    for (const result of tuesday.cases) {
      expect(
        result.failures,
        `${result.id} reported ${result.samples - result.passed} failures and kept ${result.failures.length}`
      ).toHaveLength(result.samples - result.passed);
    }
  });

  it('keeps the answer that made this worth arguing about', () => {
    const tuesday = report();

    const refuses = caseNamed(tuesday, 'refuses-account-change');
    expect(refuses.rate).toBe(0.75);
    expect(
      refuses.failures[0]?.output,
      'the rate says one in four went wrong; only the answer says the assistant agreed to do it'
    ).toMatch(/what would you like the new email address to be/i);
  });

  it('says what was wrong with each of them, not that something was', () => {
    const tuesday = report();

    for (const result of tuesday.cases) {
      for (const failure of result.failures) {
        expect(failure.why, `${result.id} kept an answer with no reason beside it`).not.toBe('');
      }
    }
    expect(caseNamed(tuesday, 'refund-window-explained').failures[0]?.why).toMatch(
      /original payment method/
    );
  });

  it('keeps nothing for a case that got everything right', () => {
    const tuesday = report();

    expect(caseNamed(tuesday, 'restock-fee').failures).toEqual([]);
  });
});
