import { beforeEach, describe, expect, it } from 'vitest';

import { FakeBroker } from '../../src/lib/broker';
import { openDb, type Db } from '../../src/lib/db';
import { Relay } from '../../src/lib/relay';
import { laterEvent, markedPublished, newOrder, unpublished } from '../support/outbox';

let db: Db;
let broker: FakeBroker;

beforeEach(() => {
  db = openDb();
  broker = new FakeBroker();
});

describe('nothing is marked that the broker did not take', () => {
  it('leaves a refused row unpublished, so the next pass sends it', async () => {
    newOrder(db, 100);
    broker.refuseEvery('1');
    const relay = new Relay(db, broker, { batchSize: 10 });

    await relay.runOnce().catch(() => undefined);

    expect(broker.publishedIds(), 'the broker never took it').toEqual([]);
    expect(unpublished(db), 'so it has to still be waiting').toEqual([1]);

    broker.accept('1');
    await relay.runOnce();

    expect(broker.publishedIds()).toEqual(['1']);
    expect(unpublished(db)).toEqual([]);
  });

  it('never marks a row published that the broker did not take', async () => {
    const first = newOrder(db, 100);
    newOrder(db, 200);
    newOrder(db, 300);
    laterEvent(db, first.order, 'order.paid');
    broker.refuseEvery('2');

    await new Relay(db, broker, { batchSize: 10 }).runOnce().catch(() => undefined);

    expect(
      markedPublished(db),
      'every row marked published has to be one the broker actually took'
    ).toEqual([...broker.publishedIds()].sort());
  });

  it('sends again when the mark is what died, and the duplicate carries the same id', async () => {
    newOrder(db, 100);
    const relay = new Relay(db, broker, { batchSize: 10 });

    // The publish lands and the write that records it does not, which is the
    // window this design chooses to have.
    db.failNextWrite('UPDATE outbox');
    await relay.runOnce().catch(() => undefined);

    expect(broker.publishedIds(), 'the broker took it').toEqual(['1']);
    expect(unpublished(db), 'nothing recorded that, so it is still waiting').toEqual([1]);

    await relay.runOnce();

    expect(
      broker.publishedIds(),
      'a duplicate, carrying the id that lets a consumer recognise it'
    ).toEqual(['1', '1']);
    expect(unpublished(db)).toEqual([]);
  });
});
