import { describe, expect, it } from 'vitest';

import { listEmployees } from '../../src/server/employees';
import { firstViolation, generateRosters } from '../support/rosters';

describe('the rules hold on rosters nobody wrote', () => {
  it('holds on generated rosters', () => {
    const violation = firstViolation(generateRosters(20260822, 60), listEmployees);
    if (violation) expect.fail(violation);
  });

  it('holds on generated rosters from a second seed', () => {
    const violation = firstViolation(generateRosters(514229, 60), listEmployees);
    if (violation) expect.fail(violation);
  });
});
