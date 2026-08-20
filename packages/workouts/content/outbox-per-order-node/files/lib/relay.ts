import type { FakeBroker } from './broker';
import type { Db, OutboxRow } from './db';

export interface RelayOptions {
  /** How many outbox rows one pass takes. */
  batchSize: number;
}

/** What one pass of the relay did. */
export interface RelayOutcome {
  /** Rows that reached the broker and are now marked published. */
  published: number;
  /** Rows this pass stopped on. 0 or 1: it stops at the first one. */
  failed: number;
}

const SELECT_UNPUBLISHED = `
  SELECT id, topic, payload, published_at
  FROM outbox
  WHERE published_at IS NULL
  ORDER BY id
  LIMIT ?
`;

/**
 * Moves committed outbox rows to the broker.
 *
 * Publish, then mark, one row at a time and outside any transaction. Each of
 * those three is load-bearing and the reasons are different, so they are on the
 * lines they belong to.
 */
export class Relay {
  constructor(
    private readonly db: Db,
    private readonly broker: FakeBroker,
    private readonly options: RelayOptions
  ) {}

  async runOnce(): Promise<RelayOutcome> {
    const rows = this.db.prepare(SELECT_UNPUBLISHED).all<OutboxRow>(this.options.batchSize);

    let published = 0;

    for (const row of rows) {
      try {
        await this.broker.publish(row.topic, JSON.parse(row.payload) as unknown, {
          messageId: String(row.id),
        });
      } catch {
        // Stop rather than skip: the rows behind this one keep their place, and
        // this one keeps its unpublished mark so the next pass sends it again.
        return { published, failed: 1 };
      }

      // Only now. A mark that outruns the broker is a message nobody will ever
      // send and nobody will ever miss.
      this.db
        .prepare('UPDATE outbox SET published_at = ? WHERE id = ?')
        .run(new Date().toISOString(), row.id);

      published += 1;
    }

    return { published, failed: 0 };
  }
}
