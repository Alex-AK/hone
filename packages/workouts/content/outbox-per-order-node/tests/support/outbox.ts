import { placeOrder, type Db } from '../../src/lib/db';

/** An order, and the `order.placed` row the writer put in the outbox for it. */
export interface Placed {
  order: number;
  outbox: number;
}

export function newOrder(db: Db, total: number): Placed {
  const order = placeOrder(db, total);
  return { order, outbox: lastOutboxId(db) };
}

/**
 * A later event for an order, written straight into the outbox.
 *
 * `placeOrder` is the only writer this workspace ships and it only writes
 * `order.placed`; the rest of the service writes `order.paid` and
 * `order.cancelled` into the same table, and this is that.
 */
export function laterEvent(db: Db, order: number, topic: string): number {
  db.prepare('INSERT INTO outbox (topic, payload) VALUES (?, ?)').run(
    topic,
    JSON.stringify({ orderId: order })
  );
  return lastOutboxId(db);
}

export function unpublished(db: Db): number[] {
  return db
    .prepare('SELECT id FROM outbox WHERE published_at IS NULL ORDER BY id')
    .all<{ id: number }>()
    .map((row) => row.id);
}

export function markedPublished(db: Db): string[] {
  return db
    .prepare('SELECT id FROM outbox WHERE published_at IS NOT NULL ORDER BY id')
    .all<{ id: number }>()
    .map((row) => String(row.id));
}

function lastOutboxId(db: Db): number {
  return db.prepare('SELECT MAX(id) AS id FROM outbox').get<{ id: number }>()?.id ?? 0;
}
