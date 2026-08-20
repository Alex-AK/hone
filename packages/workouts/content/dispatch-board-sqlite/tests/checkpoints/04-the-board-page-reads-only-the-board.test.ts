import { beforeEach, describe, expect, it } from 'vitest';

import { listBoard } from '../../src/server/board';
import { createDb, type Db } from '../../src/server/db';

let db: Db;

beforeEach(() => {
  db = createDb();
});

/** The statements one call to the board caused. */
function statementsFor(status?: string) {
  db.clearStatements();
  listBoard(db, status);
  return [...db.statements];
}

const WRITE_MODEL = /\b(from|join)\s+(consignment|parcel)\b/i;

describe('the page that renders the dispatch board', () => {
  it('answers with one statement', () => {
    const statements = statementsFor();

    expect(statements.length, `the board page ran ${statements.length} statements`).toBe(1);
  });

  it('reads the board rather than going back to the consignments', () => {
    const wentBack = [...statementsFor(), ...statementsFor('booked')].filter((sql) =>
      WRITE_MODEL.test(sql)
    );

    expect(wentBack, 'the board page reads the consignment tables').toEqual([]);
  });

  it('still shows what the board holds', () => {
    expect(listBoard(db, 'booked').map((row) => row.reference)).toEqual(['CN-4402', 'CN-4404']);
    expect(listBoard(db)[0]).toEqual({
      reference: 'CN-4403',
      customer: 'Aster Labs',
      status: 'dispatched',
      parcelCount: 2,
      totalGrams: 1400,
    });
  });
});
