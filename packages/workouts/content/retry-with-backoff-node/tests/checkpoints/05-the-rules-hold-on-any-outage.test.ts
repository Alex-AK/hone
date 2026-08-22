import { describe, expect, it } from 'vitest';

import { firstViolation, generateScenarios } from '../support/calls';

/**
 * The other four drive outages somebody wrote, where every wait is measured on
 * a run of 503s and every ambiguous failure is a dropped connection. This one
 * generates the outage, the options and the request, and checks that the rules
 * the brief states held whatever the client did with it.
 */
describe('the rules hold on outages nobody wrote', () => {
  it('holds on generated outages', async () => {
    const violation = await firstViolation(generateScenarios(20260822, 60));
    if (violation) expect.fail(violation);
  });

  it('holds on generated outages from a second seed', async () => {
    const violation = await firstViolation(generateScenarios(317811, 60));
    if (violation) expect.fail(violation);
  });
});
