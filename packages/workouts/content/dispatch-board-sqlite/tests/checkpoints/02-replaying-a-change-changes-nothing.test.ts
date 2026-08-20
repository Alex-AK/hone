import { beforeEach, describe, expect, it } from 'vitest';

import { applyChange, type Change } from '../../src/server/board';
import { addParcel, bookConsignment, markDispatched } from '../../src/server/consignments';
import { createDb, type Db } from '../../src/server/db';
import { actualBoard, expectedBoard } from '../support/board';

let db: Db;

beforeEach(() => {
  db = createDb();
});

const twice = 'the relay delivered that change twice and the board counted it twice';

describe('a change the relay delivers twice', () => {
  it('adds one parcel to the board, not two', () => {
    addParcel(db, { consignmentId: 2, barcode: 'P-90100', weightGrams: 1500 });

    applyChange(db, { kind: 'parcel-added', consignmentId: 2, weightGrams: 1500 });

    expect(actualBoard(db), twice).toEqual(expectedBoard(db));
  });

  it('leaves one row for a consignment, not a second one and not an error', () => {
    const id = bookConsignment(db, { reference: 'CN-4500', customer: 'Renwick Tools' });

    expect(() => applyChange(db, { kind: 'consignment-booked', consignmentId: id })).not.toThrow();
    expect(actualBoard(db), twice).toEqual(expectedBoard(db));
  });

  it('leaves the board where it was when a whole morning is replayed', () => {
    const id = bookConsignment(db, { reference: 'CN-4500', customer: 'Halloway Foods' });
    addParcel(db, { consignmentId: id, barcode: 'P-90100', weightGrams: 1500 });
    addParcel(db, { consignmentId: id, barcode: 'P-90101', weightGrams: 800 });
    markDispatched(db, id);

    const morning: Change[] = [
      { kind: 'consignment-booked', consignmentId: id },
      { kind: 'parcel-added', consignmentId: id, weightGrams: 1500 },
      { kind: 'parcel-added', consignmentId: id, weightGrams: 800 },
      { kind: 'status-changed', consignmentId: id, status: 'dispatched' },
    ];
    const before = actualBoard(db);

    for (const change of morning) applyChange(db, change);

    expect(actualBoard(db), twice).toEqual(before);
  });
});
