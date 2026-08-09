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

function unpublished(): number[] {
  return db
    .prepare('SELECT id FROM outbox WHERE published_at IS NULL ORDER BY id')
    .all<{ id: number }>()
    .map((row) => row.id);
}

describe('a stuck message blocks the ones behind it', () => {
  it('stops at the refused row and leaves everything after it alone', async () => {
    for (const total of [100, 200, 300, 400]) placeOrder(db, total);
    broker.refuseEvery('2');

    await new Relay(db, broker, { batchSize: 10 }).runOnce().catch(() => undefined);

    expect(broker.publishedIds(), 'only the row in front of the stuck one').toEqual(['1']);
    expect(
      unpublished(),
      'the stuck row keeps its place, and so does everything behind it'
    ).toEqual([2, 3, 4]);
  });

  it('reports the row it stopped on rather than throwing', async () => {
    for (const total of [100, 200, 300]) placeOrder(db, total);
    broker.refuseEvery('2');

    await expect(new Relay(db, broker, { batchSize: 10 }).runOnce()).resolves.toEqual({
      published: 1,
      failed: 1,
    });
  });

  it('makes no progress at all while the row stays stuck', async () => {
    for (const total of [100, 200, 300]) placeOrder(db, total);
    broker.refuseEvery('2');
    const relay = new Relay(db, broker, { batchSize: 10 });

    await relay.runOnce().catch(() => undefined);
    await relay.runOnce().catch(() => undefined);
    await relay.runOnce().catch(() => undefined);

    expect(broker.publishedIds(), 'row 1 was already sent and must not be resent').toEqual(['1']);
    expect(unpublished()).toEqual([2, 3]);
  });

  it('picks up in order once the stuck row clears', async () => {
    for (const total of [100, 200, 300]) placeOrder(db, total);
    broker.refuseEvery('2');
    const relay = new Relay(db, broker, { batchSize: 10 });

    await relay.runOnce().catch(() => undefined);
    broker.accept('2');
    await relay.runOnce();

    expect(broker.publishedIds()).toEqual(['1', '2', '3']);
    expect(unpublished()).toEqual([]);
  });
});
