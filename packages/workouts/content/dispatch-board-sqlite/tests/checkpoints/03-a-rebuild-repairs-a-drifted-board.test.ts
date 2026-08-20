import { beforeEach, describe, expect, it } from 'vitest';

import { rebuildBoard } from '../../src/server/board';
import { createDb, type Db } from '../../src/server/db';
import { actualBoard, expectedBoard } from '../support/board';

let db: Db;

/** A board that has drifted three ways, which is how ops finds it. */
beforeEach(() => {
  db = createDb();
  db.prepare('DELETE FROM board_row WHERE consignment_id = 1').run();
  db.prepare(
    'UPDATE board_row SET parcel_count = 14, total_grams = 96000 WHERE consignment_id = 3'
  ).run();
  db.prepare(
    `INSERT INTO board_row
       (consignment_id, reference, customer, status, parcel_count, total_grams, booked_at)
     VALUES (99, 'CN-4399', 'Aster Labs', 'booked', 2, 1000, '2026-02-28 11:00:00')`
  ).run();
});

const line = (db: Db, consignmentId: number) =>
  actualBoard(db).find((row) => row.consignment_id === consignmentId);

describe('a rebuild of a board that has drifted', () => {
  it('brings back the consignment that had gone missing from it', () => {
    rebuildBoard(db);

    expect(line(db, 1), 'CN-4401 is still missing from the board').toEqual({
      consignment_id: 1,
      reference: 'CN-4401',
      customer: 'Halloway Foods',
      status: 'picking',
      parcel_count: 3,
      total_grams: 6400,
    });
  });

  it('corrects the row whose numbers were wrong', () => {
    rebuildBoard(db);

    expect(line(db, 3), 'the board still says 14 parcels for a consignment that has 2').toEqual({
      consignment_id: 3,
      reference: 'CN-4403',
      customer: 'Aster Labs',
      status: 'dispatched',
      parcel_count: 2,
      total_grams: 1400,
    });
  });

  it('takes off the row for a consignment that does not exist', () => {
    rebuildBoard(db);

    expect(line(db, 99), 'the board still shows a consignment nobody booked').toBeUndefined();
  });

  it('leaves the board agreeing with the consignments, and safe to run again', () => {
    rebuildBoard(db);
    rebuildBoard(db);

    expect(actualBoard(db), 'the board and the consignments disagree').toEqual(expectedBoard(db));
  });
});
