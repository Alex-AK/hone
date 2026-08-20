import { beforeEach, describe, expect, it } from 'vitest';

import { listBoard } from '../../src/server/board';
import {
  addParcel,
  bookConsignment,
  cancelConsignment,
  markDispatched,
  startPicking,
} from '../../src/server/consignments';
import { createDb, type Db } from '../../src/server/db';
import { actualBoard, expectedBoard } from '../support/board';

let db: Db;

beforeEach(() => {
  db = createDb();
});

const disagrees = 'the board and the consignments disagree';

describe('the board agrees with the consignments after every change', () => {
  it('when one is booked and packed', () => {
    const id = bookConsignment(db, { reference: 'CN-4500', customer: 'Renwick Tools' });
    addParcel(db, { consignmentId: id, barcode: 'P-90100', weightGrams: 1500 });
    addParcel(db, { consignmentId: id, barcode: 'P-90101', weightGrams: 800 });

    expect(actualBoard(db), disagrees).toEqual(expectedBoard(db));
  });

  it('when one moves through picking and out on the van', () => {
    startPicking(db, 2);
    markDispatched(db, 2);

    expect(actualBoard(db), disagrees).toEqual(expectedBoard(db));
  });

  it('when the customer calls one off', () => {
    cancelConsignment(db, 1);

    expect(actualBoard(db), disagrees).toEqual(expectedBoard(db));
  });

  it('so a cancelled consignment is off the list the pickers work from', () => {
    cancelConsignment(db, 1);
    startPicking(db, 2);

    const picking = listBoard(db, 'picking').map((row) => row.reference);

    expect(picking, 'a cancelled consignment is still waiting to be picked').toEqual(['CN-4402']);
  });
});
