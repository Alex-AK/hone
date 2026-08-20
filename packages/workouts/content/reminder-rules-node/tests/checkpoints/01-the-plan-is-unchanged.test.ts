import { beforeEach, describe, expect, it } from 'vitest';

import { setNow } from '../../src/server/clock';
import { runNightly } from '../../src/server/nightly';
import { chaseRun } from '../../src/server/run';
import { reset, sentReminders } from '../../src/server/store';

const TONIGHT = '2025-05-20T09:00:00.000Z';

beforeEach(() => {
  reset();
  setNow(TONIGHT);
});

describe('the plan is the plan it was', () => {
  it('picks the same five invoices, at the same levels, in the same order', () => {
    expect(chaseRun()).toEqual([
      {
        invoiceId: 'INV-1005',
        customerId: 'crole',
        level: 'first',
        daysOverdue: 35,
        amountPence: 76000,
      },
      {
        invoiceId: 'INV-1001',
        customerId: 'ashby',
        level: 'final',
        daysOverdue: 25,
        amountPence: 41200,
      },
      {
        invoiceId: 'INV-1011',
        customerId: 'drake',
        level: 'second',
        daysOverdue: 8,
        amountPence: 31800,
      },
      {
        invoiceId: 'INV-1002',
        customerId: 'ashby',
        level: 'second',
        daysOverdue: 7,
        amountPence: 9850,
      },
      {
        invoiceId: 'INV-1006',
        customerId: 'crole',
        level: 'first',
        daysOverdue: 2,
        amountPence: 14500,
      },
    ]);
  });

  it('sends what the plan says, stamped with the instant the job ran', () => {
    expect(runNightly()).toEqual({ sent: 5, byLevel: { first: 2, second: 2, final: 1 } });
    expect(sentReminders()).toEqual([
      { invoiceId: 'INV-1005', level: 'first', sentAt: TONIGHT },
      { invoiceId: 'INV-1001', level: 'final', sentAt: TONIGHT },
      { invoiceId: 'INV-1011', level: 'second', sentAt: TONIGHT },
      { invoiceId: 'INV-1002', level: 'second', sentAt: TONIGHT },
      { invoiceId: 'INV-1006', level: 'first', sentAt: TONIGHT },
    ]);
  });

  it('run twice the same night, reaches only what the cap held back', () => {
    runNightly();

    expect(runNightly()).toEqual({ sent: 1, byLevel: { first: 1, second: 0, final: 0 } });
    expect(sentReminders().slice(5)).toEqual([
      { invoiceId: 'INV-1003', level: 'first', sentAt: TONIGHT },
    ]);
  });
});
