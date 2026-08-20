import { describe, expect, it } from 'vitest';

import { firstViolation, generateScenarios } from '../support/schedules';

/**
 * The other four drive schedules somebody wrote, where the clock never moves
 * while a computation is in flight. This one generates the schedule, the keys
 * and the TTL, and checks that the rules the brief states held whatever the
 * cache did with it.
 */
describe('the rules hold on schedules nobody wrote', () => {
  it('holds on generated schedules', async () => {
    const violation = await firstViolation(generateScenarios(20260812, 40));
    if (violation) expect.fail(violation);
  });

  it('holds on generated schedules from a second seed', async () => {
    const violation = await firstViolation(generateScenarios(514229, 40));
    if (violation) expect.fail(violation);
  });
});
