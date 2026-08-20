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

/**
 * Three orders, two events each, written interleaved. Row 2 is the second
 * order's first message, and it is the one the broker will not take.
 */
function threeOrdersWithTheSecondStuck(): void {
  const first = newOrder(db, 100);
  const second = newOrder(db, 200);
  const third = newOrder(db, 300);
  laterEvent(db, first.order, 'order.paid');
  laterEvent(db, second.order, 'order.paid');
  laterEvent(db, third.order, 'order.cancelled');
  broker.refuseEvery('2');
}

describe('one stuck order does not hold up the rest', () => {
  it('reports what it sent and how many orders it stopped on', async () => {
    threeOrdersWithTheSecondStuck();

    await expect(new Relay(db, broker, { batchSize: 10 }).runOnce()).resolves.toEqual({
      published: 4,
      blocked: 1,
    });
  });

  it('gets every other order all the way through', async () => {
    threeOrdersWithTheSecondStuck();

    await new Relay(db, broker, { batchSize: 10 }).runOnce().catch(() => undefined);

    expect([...broker.publishedIds()].sort(), 'the orders behind the stuck one').toEqual([
      '1',
      '3',
      '4',
      '6',
    ]);
    expect(unpublished(db), 'only the stuck order is left').toEqual([2, 5]);
  });

  it('resends nothing on a later pass while the order stays stuck', async () => {
    threeOrdersWithTheSecondStuck();
    const relay = new Relay(db, broker, { batchSize: 10 });

    await relay.runOnce().catch(() => undefined);

    await expect(relay.runOnce()).resolves.toEqual({ published: 0, blocked: 1 });
    expect([...broker.publishedIds()].sort()).toEqual(['1', '3', '4', '6']);
  });

  it('picks the stuck order up once the broker takes it', async () => {
    threeOrdersWithTheSecondStuck();
    const relay = new Relay(db, broker, { batchSize: 10 });

    await relay.runOnce().catch(() => undefined);
    broker.accept('2');
    await relay.runOnce();

    expect(broker.publishedIds().filter((id) => id === '2' || id === '5')).toEqual(['2', '5']);
    expect(unpublished(db)).toEqual([]);
  });
});
