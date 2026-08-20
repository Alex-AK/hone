import { describe, expect, it } from 'vitest';

import { firstViolation, generateScenarios } from '../support/feeds';

/**
 * The other four walk one feed, twenty to a page. This one generates the feed,
 * the page size and what happens to it mid-walk, and checks that the rules the
 * brief states held whatever came out.
 */
describe('the rules hold on feeds nobody wrote', () => {
  it('holds on generated feeds', () => {
    const violation = firstViolation(generateScenarios(20260811, 40));
    if (violation) expect.fail(violation);
  });

  it('holds on generated feeds from a second seed', () => {
    const violation = firstViolation(generateScenarios(514229, 40));
    if (violation) expect.fail(violation);
  });
});
