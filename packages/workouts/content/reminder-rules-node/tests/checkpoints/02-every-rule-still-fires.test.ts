import { describe, expect, it } from 'vitest';

import { setNow } from '../../src/server/clock';
import type { Planned } from '../../src/server/model';
import { chaseRun } from '../../src/server/run';
import { reset } from '../../src/server/store';

function planAt(instant: string): Planned[] {
  reset();
  setNow(instant);
  return chaseRun();
}

function chased(instant: string, invoiceId: string): Planned | undefined {
  return planAt(instant).find((item) => item.invoiceId === invoiceId);
}

describe('every rule still fires where it did', () => {
  it('leaves an invoice alone until the day after it falls due', () => {
    expect(chased('2025-05-13T09:00:00.000Z', 'INV-1002')).toBeUndefined();
    expect(chased('2025-05-14T00:30:00.000Z', 'INV-1002')).toMatchObject({
      level: 'first',
      daysOverdue: 1,
    });
  });

  it('escalates on day 7 and again on day 21', () => {
    expect(chased('2025-05-15T09:00:00.000Z', 'INV-1001')).toMatchObject({
      level: 'second',
      daysOverdue: 20,
    });
    expect(chased('2025-05-16T09:00:00.000Z', 'INV-1001')).toMatchObject({
      level: 'final',
      daysOverdue: 21,
    });
    expect(chased('2025-05-19T09:00:00.000Z', 'INV-1011')).toMatchObject({ level: 'second' });
  });

  it('says nothing to a customer on hold, however far behind they are', () => {
    expect(chased('2025-06-01T09:00:00.000Z', 'INV-1004')).toBeUndefined();
  });

  it('never escalates a customer who is on a payment plan', () => {
    expect(chased('2025-06-01T09:00:00.000Z', 'INV-1005')).toMatchObject({
      level: 'first',
      daysOverdue: 47,
    });
  });

  it('does not send a level that has already gone out for that invoice', () => {
    expect(chased('2025-05-20T09:00:00.000Z', 'INV-1008')).toBeUndefined();
  });

  it('stays quiet for three days after anything went out about an invoice', () => {
    expect(chased('2025-05-20T09:00:00.000Z', 'INV-1009')).toBeUndefined();
    expect(chased('2025-05-23T09:00:00.000Z', 'INV-1009')).toMatchObject({ level: 'second' });
  });

  it('leaves a paid invoice out of every run', () => {
    for (const instant of ['2025-05-20T09:00:00.000Z', '2025-06-01T09:00:00.000Z']) {
      expect(planAt(instant).map((item) => item.invoiceId)).not.toContain('INV-1010');
    }
  });

  it('caps a customer at two a run, and drops the least overdue', () => {
    const ashby = planAt('2025-05-20T09:00:00.000Z').filter((item) => item.customerId === 'ashby');

    expect(ashby.map((item) => item.invoiceId)).toEqual(['INV-1001', 'INV-1002']);
  });
});
