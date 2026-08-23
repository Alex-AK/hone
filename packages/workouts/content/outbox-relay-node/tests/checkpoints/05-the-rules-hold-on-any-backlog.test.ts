import { describe, expect, it } from 'vitest';

import { firstViolation, generateBacklogs } from '../support/backlogs';

describe('the rules hold on backlogs nobody wrote', () => {
  it('holds on generated backlogs', async () => {
    const violation = await firstViolation(generateBacklogs(20260823, 40));
    if (violation) expect.fail(violation);
  });

  it('holds on generated backlogs from a second seed', async () => {
    const violation = await firstViolation(generateBacklogs(514229, 40));
    if (violation) expect.fail(violation);
  });
});
