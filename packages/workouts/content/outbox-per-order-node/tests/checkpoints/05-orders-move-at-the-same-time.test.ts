import { beforeEach, describe, expect, it } from 'vitest';

import { FakeBroker } from '../../src/lib/broker';
import { openDb, type Db } from '../../src/lib/db';
import { Relay } from '../../src/lib/relay';
import { laterEvent, newOrder } from '../support/outbox';

let db: Db;
let broker: FakeBroker;

beforeEach(() => {
  db = openDb();
  broker = new FakeBroker();
});

/**
 * How many publishes were in flight as each one started, in the order they
 * started. All ones is one message at a time, whatever it was about.
 *
 * It counts starts against landings, so it only reads correctly while nothing is
 * refused: a refused publish never lands and would hold the count up for the
 * rest of the pass. Nothing is refused in this suite.
 */
function watchInFlight(): number[] {
  const inFlight: number[] = [];
  let started = 0;

  broker.observeEachPublish(() => {
    started += 1;
    inFlight.push(started - broker.publishedIds().length);
  });

  return inFlight;
}

describe('orders move at the same time', () => {
  it('has more than one publish in flight when the batch holds several orders', async () => {
    newOrder(db, 100);
    newOrder(db, 200);
    newOrder(db, 300);
    const inFlight = watchInFlight();

    await new Relay(db, broker, { batchSize: 10 }).runOnce();

    expect(inFlight).toHaveLength(3);
    expect(
      Math.max(...inFlight),
      'every publish waited for the one before it, so three orders cost three round trips'
    ).toBeGreaterThanOrEqual(2);
  });

  it('sends one order its messages one at a time', async () => {
    const only = newOrder(db, 100);
    laterEvent(db, only.order, 'order.paid');
    laterEvent(db, only.order, 'order.cancelled');
    const inFlight = watchInFlight();

    await new Relay(db, broker, { batchSize: 10 }).runOnce();

    expect(inFlight, 'these are all one order, so each one waits for the last to land').toEqual([
      1, 1, 1,
    ]);
  });

  it('holds no transaction while a publish is in flight', async () => {
    newOrder(db, 100);
    newOrder(db, 200);
    const heldDuringPublish: boolean[] = [];
    broker.observeEachPublish(() => heldDuringPublish.push(db.inTransaction));

    await new Relay(db, broker, { batchSize: 10 }).runOnce();

    expect(heldDuringPublish, 'two publishes should have been observed').toHaveLength(2);
    expect(
      heldDuringPublish,
      'a transaction open across a network call blocks every other writer for its duration'
    ).toEqual([false, false]);
  });

  it('never has two messages of the same order in flight together', async () => {
    const first = newOrder(db, 100);
    const second = newOrder(db, 200);
    const third = newOrder(db, 300);
    laterEvent(db, first.order, 'order.paid');
    laterEvent(db, second.order, 'order.paid');
    laterEvent(db, third.order, 'order.cancelled');
    const inFlight = watchInFlight();

    await new Relay(db, broker, { batchSize: 10 }).runOnce();

    expect(Math.max(...inFlight)).toBeGreaterThanOrEqual(2);
    expect(
      Math.max(...inFlight),
      'three orders, so at most three publishes: any more is one order overtaking itself'
    ).toBeLessThanOrEqual(3);
  });
});
