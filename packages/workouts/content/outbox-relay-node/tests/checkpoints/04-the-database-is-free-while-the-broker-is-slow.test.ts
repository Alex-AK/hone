import { beforeEach, describe, expect, it } from 'vitest';

import { FakeBroker } from '../../src/lib/broker';
import { openDb, placeOrder, type Db } from '../../src/lib/db';
import { Relay } from '../../src/lib/relay';

let db: Db;
let broker: FakeBroker;

beforeEach(() => {
  db = openDb();
  broker = new FakeBroker();
});

describe('the database is free while the broker is slow', () => {
  it('holds no transaction while a publish is in flight', async () => {
    for (const total of [100, 200, 300]) placeOrder(db, total);

    const heldDuringPublish: boolean[] = [];
    broker.observeEachPublish(() => heldDuringPublish.push(db.inTransaction));

    await new Relay(db, broker, { batchSize: 10 }).runOnce();

    expect(heldDuringPublish, 'three publishes should have been observed').toHaveLength(3);
    expect(
      heldDuringPublish,
      'a transaction open across a network call blocks every other writer for its duration'
    ).toEqual([false, false, false]);
  });

  it('leaves no transaction open when a publish fails', async () => {
    placeOrder(db, 100);
    placeOrder(db, 200);
    broker.refuseEvery('1');

    await new Relay(db, broker, { batchSize: 10 }).runOnce().catch(() => undefined);

    expect(db.inTransaction, 'the connection must not be left mid-transaction').toBe(false);
  });
});
