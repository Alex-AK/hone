import { describe, expect, it } from 'vitest';

import { firstViolation, generateBursts } from '../support/bursts';

describe('the rules hold on bursts nobody wrote', () => {
  it('holds on generated bursts', async () => {
    const violation = await firstViolation(generateBursts(20260823, 28));
    if (violation) expect.fail(violation);
  });

  it('holds on generated bursts from a second seed', async () => {
    const violation = await firstViolation(generateBursts(514229, 28));
    if (violation) expect.fail(violation);
  });
});
