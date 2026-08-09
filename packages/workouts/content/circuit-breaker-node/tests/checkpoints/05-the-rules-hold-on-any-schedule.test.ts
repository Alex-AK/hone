import { describe, expect, it } from 'vitest';

import { firstViolation, generateScenarios } from '../support/properties';

/**
 * The other four checkpoints drive schedules somebody chose. This one generates
 * them, along with the threshold, the wait and the timeout, and checks the rules
 * the brief states held whatever the schedule turned out to be.
 */
describe('the rules hold on schedules nobody wrote', () => {
  it('holds on generated schedules', async () => {
    const violation = await firstViolation(generateScenarios(20260809, 40));
    if (violation) expect.fail(violation);
  });

  it('holds on generated schedules from a second seed', async () => {
    const violation = await firstViolation(generateScenarios(514229, 40));
    if (violation) expect.fail(violation);
  });
});
