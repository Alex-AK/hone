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

describe('every unpublished row reaches the broker', () => {
  it('sends every row once, in the order they were written', async () => {
    placeOrder(db, 100);
    placeOrder(db, 200);
    placeOrder(db, 300);

    const relay = new Relay(db, broker, { batchSize: 10 });

    await expect(relay.runOnce()).resolves.toEqual({ published: 3, failed: 0 });

    expect(broker.publishedIds()).toEqual(['1', '2', '3']);
    expect(unpublished(), 'everything the broker took should be marked').toEqual([]);
  });

  it('carries the topic and the parsed payload', async () => {
    placeOrder(db, 250);

    await new Relay(db, broker, { batchSize: 10 }).runOnce();

    expect(broker.published()).toEqual([
      { topic: 'order.placed', payload: { orderId: 1, total: 250 }, messageId: '1' },
    ]);
  });

  it('takes at most batchSize rows a pass and leaves the rest', async () => {
    for (const total of [100, 200, 300, 400, 500]) placeOrder(db, total);

    const relay = new Relay(db, broker, { batchSize: 2 });
    await relay.runOnce();

    expect(broker.publishedIds()).toEqual(['1', '2']);
    expect(unpublished()).toEqual([3, 4, 5]);

    await relay.runOnce();
    expect(broker.publishedIds()).toEqual(['1', '2', '3', '4']);
  });

  it('does nothing when everything has already been sent', async () => {
    placeOrder(db, 100);
    const relay = new Relay(db, broker, { batchSize: 10 });

    await relay.runOnce();

    await expect(relay.runOnce()).resolves.toEqual({ published: 0, failed: 0 });
    expect(broker.publishedIds(), 'a second pass must not resend it').toEqual(['1']);
  });
});
