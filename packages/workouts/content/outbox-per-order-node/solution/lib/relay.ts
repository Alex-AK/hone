import type { FakeBroker } from './broker';
import type { Db, OutboxRow } from './db';

export interface RelayOptions {
  /** How many outbox rows one pass takes. */
  batchSize: number;
}

/** What one pass of the relay did. */
export interface RelayOutcome {
  /** Messages that reached the broker and are now marked published. */
  published: number;
  /** Orders this pass stopped on. Their unsent rows kept their place. */
  blocked: number;
}

/** The only thing in a row that says which order the message is about. */
interface EventPayload {
  orderId: number;
}

interface Message {
  row: OutboxRow;
  payload: EventPayload;
}

const SELECT_UNPUBLISHED = `
  SELECT id, topic, payload, published_at
  FROM outbox
  WHERE published_at IS NULL
  ORDER BY id
  LIMIT ?
`;

/**
 * Moves committed outbox rows to the broker, one stream per order.
 *
 * Ordering is a promise per order rather than across the batch, because that is
 * all fulfilment reads: inside an order each publish waits for the last one to
 * land, and the orders run against each other. The batch is still taken in `id`
 * order, so an order's own messages are already in the order they were written.
 */
export class Relay {
  constructor(
    private readonly db: Db,
    private readonly broker: FakeBroker,
    private readonly options: RelayOptions
  ) {}

  async runOnce(): Promise<RelayOutcome> {
    const rows = this.db.prepare(SELECT_UNPUBLISHED).all<OutboxRow>(this.options.batchSize);

    const streams = new Map<number, Message[]>();
    for (const row of rows) {
      const payload = JSON.parse(row.payload) as EventPayload;
      const stream = streams.get(payload.orderId);
      if (stream) stream.push({ row, payload });
      else streams.set(payload.orderId, [{ row, payload }]);
    }

    const outcomes = await Promise.all([...streams.values()].map((stream) => this.drain(stream)));

    return {
      published: outcomes.reduce((total, outcome) => total + outcome.published, 0),
      blocked: outcomes.filter((outcome) => outcome.blocked).length,
    };
  }

  /** One order's messages, in the order they were written, as far as they get. */
  private async drain(stream: Message[]): Promise<{ published: number; blocked: boolean }> {
    let published = 0;

    for (const { row, payload } of stream) {
      try {
        await this.broker.publish(row.topic, payload, { messageId: String(row.id) });
      } catch {
        // Stop this order rather than skip the row: what is behind it is the
        // rest of the same order, and a cancellation ahead of its payment is
        // worse than a late one.
        return { published, blocked: true };
      }

      // Only now. A mark that outruns the broker is a message nobody will ever
      // send and nobody will ever miss.
      this.db
        .prepare('UPDATE outbox SET published_at = ? WHERE id = ?')
        .run(new Date().toISOString(), row.id);

      published += 1;
    }

    return { published, blocked: false };
  }
}
