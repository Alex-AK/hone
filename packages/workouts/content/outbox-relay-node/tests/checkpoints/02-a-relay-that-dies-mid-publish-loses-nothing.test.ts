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

function markedPublished(): string[] {
  return db
    .prepare('SELECT id FROM outbox WHERE published_at IS NOT NULL ORDER BY id')
    .all<{ id: number }>()
    .map((row) => String(row.id));
}

describe('a relay that dies mid publish loses nothing', () => {
  it('leaves a refused row unpublished, so the next pass sends it', async () => {
    placeOrder(db, 100);
    broker.refuseEvery('1');
    const relay = new Relay(db, broker, { batchSize: 10 });

    await relay.runOnce().catch(() => undefined);

    expect(broker.publishedIds(), 'the broker never took it').toEqual([]);
    expect(unpublished(), 'so it has to still be waiting').toEqual([1]);

    broker.accept('1');
    await relay.runOnce();

    expect(broker.publishedIds()).toEqual(['1']);
    expect(unpublished()).toEqual([]);
  });

  it('never marks a row published that the broker did not take', async () => {
    placeOrder(db, 100);
    placeOrder(db, 200);
    placeOrder(db, 300);
    broker.refuseEvery('2');

    await new Relay(db, broker, { batchSize: 10 }).runOnce().catch(() => undefined);

    expect(
      markedPublished(),
      'every row marked published has to be one the broker actually took'
    ).toEqual(broker.publishedIds());
  });

  it('sends again when the mark is what died, and the duplicate carries the same id', async () => {
    placeOrder(db, 100);
    const relay = new Relay(db, broker, { batchSize: 10 });

    // The publish lands and the write that records it does not, which is the
    // window this design chooses to have.
    db.failNextWrite('UPDATE outbox');
    await relay.runOnce().catch(() => undefined);

    expect(broker.publishedIds(), 'the broker took it').toEqual(['1']);
    expect(unpublished(), 'nothing recorded that, so it is still waiting').toEqual([1]);

    await relay.runOnce();

    expect(
      broker.publishedIds(),
      'a duplicate, carrying the id that lets a consumer recognise it'
    ).toEqual(['1', '1']);
    expect(unpublished()).toEqual([]);
  });
});
