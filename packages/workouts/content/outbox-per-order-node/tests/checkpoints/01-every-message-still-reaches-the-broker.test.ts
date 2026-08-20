import { beforeEach, describe, expect, it } from 'vitest';

import { FakeBroker } from '../../src/lib/broker';
import { openDb, type Db } from '../../src/lib/db';
import { Relay } from '../../src/lib/relay';
import { laterEvent, newOrder, unpublished } from '../support/outbox';

let db: Db;
let broker: FakeBroker;

beforeEach(() => {
  db = openDb();
  broker = new FakeBroker();
});

/** Three orders picking up a second event each, interleaved the way they arrive. */
function threeOrders(): { first: number; second: number; third: number } {
  const first = newOrder(db, 100);
  const second = newOrder(db, 200);
  const third = newOrder(db, 300);
  laterEvent(db, first.order, 'order.paid');
  laterEvent(db, second.order, 'order.paid');
  laterEvent(db, third.order, 'order.cancelled');
  return { first: first.order, second: second.order, third: third.order };
}

describe('every message still reaches the broker', () => {
  it('sends every unpublished row once and marks it', async () => {
    threeOrders();

    await new Relay(db, broker, { batchSize: 10 }).runOnce();

    expect([...broker.publishedIds()].sort()).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(unpublished(db), 'everything the broker took should be marked').toEqual([]);
  });

  it('carries the topic and the parsed payload', async () => {
    const { first } = threeOrders();

    await new Relay(db, broker, { batchSize: 10 }).runOnce();

    expect(broker.published()).toContainEqual({
      topic: 'order.placed',
      payload: { orderId: first, total: 100 },
      messageId: '1',
    });
    expect(broker.published()).toContainEqual({
      topic: 'order.paid',
      payload: { orderId: first },
      messageId: '4',
    });
  });

  it('takes at most batchSize rows a pass and leaves the rest', async () => {
    threeOrders();

    const relay = new Relay(db, broker, { batchSize: 2 });
    await relay.runOnce();

    expect([...broker.publishedIds()].sort()).toEqual(['1', '2']);
    expect(unpublished(db)).toEqual([3, 4, 5, 6]);

    await relay.runOnce();
    expect([...broker.publishedIds()].sort()).toEqual(['1', '2', '3', '4']);
  });

  it('does nothing when everything has already been sent', async () => {
    threeOrders();
    const relay = new Relay(db, broker, { batchSize: 10 });

    await relay.runOnce();
    const second = await relay.runOnce();

    expect(second.published).toBe(0);
    expect(broker.publishedIds(), 'a second pass must not resend anything').toHaveLength(6);
  });
});
