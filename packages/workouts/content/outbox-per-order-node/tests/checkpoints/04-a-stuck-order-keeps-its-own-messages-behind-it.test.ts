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
 * One order with three events, another order's rows sitting between them. Rows
 * 1, 3 and 5 are the first order, in the order they were written.
 */
const WATCHED = ['1', '3', '5'];

function twoOrders(): void {
  const first = newOrder(db, 100);
  const second = newOrder(db, 200);
  laterEvent(db, first.order, 'order.paid');
  laterEvent(db, second.order, 'order.paid');
  laterEvent(db, first.order, 'order.cancelled');
}

/** What the broker took from the order being watched, in the order it took it. */
function watchedPublished(): string[] {
  return broker.publishedIds().filter((id) => WATCHED.includes(id));
}

/** What is still waiting from the order being watched. Nothing else. */
function watchedWaiting(): number[] {
  return unpublished(db).filter((id) => WATCHED.includes(String(id)));
}

describe('a stuck order keeps its own messages behind it', () => {
  it('sends nothing of an order after the message the broker refused', async () => {
    twoOrders();
    broker.refuseEvery('3');

    await new Relay(db, broker, { batchSize: 10 }).runOnce().catch(() => undefined);

    expect(watchedPublished(), 'row 5 is this order and is written after row 3').toEqual(['1']);
    expect(watchedWaiting()).toEqual([3, 5]);
  });

  it('sends nothing at all when the first of an order is refused', async () => {
    twoOrders();
    broker.refuseEvery('1');

    await new Relay(db, broker, { batchSize: 10 }).runOnce().catch(() => undefined);

    expect(watchedPublished()).toEqual([]);
    expect(watchedWaiting()).toEqual([1, 3, 5]);
  });

  it('makes no progress on that order however many passes it takes', async () => {
    twoOrders();
    broker.refuseEvery('3');
    const relay = new Relay(db, broker, { batchSize: 10 });

    await relay.runOnce().catch(() => undefined);
    await relay.runOnce().catch(() => undefined);
    await relay.runOnce().catch(() => undefined);

    expect(watchedPublished()).toEqual(['1']);
    expect(watchedWaiting()).toEqual([3, 5]);
  });

  it('carries on in order once the broker takes the stuck message', async () => {
    twoOrders();
    broker.refuseEvery('3');
    const relay = new Relay(db, broker, { batchSize: 10 });

    await relay.runOnce().catch(() => undefined);
    broker.accept('3');
    await relay.runOnce();

    expect(watchedPublished()).toEqual(['1', '3', '5']);
    expect(watchedWaiting()).toEqual([]);
  });
});
