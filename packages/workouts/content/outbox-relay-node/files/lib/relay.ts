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
 * TODO: a row must never be marked published unless the broker actually took
 * it; a row the broker refuses has to keep its place, with the rows behind it
 * keeping theirs; and nothing may be held on the database while a publish is in
 * flight. See brief.md.
 */
export class Relay {
  constructor(
    private readonly db: Db,
    private readonly broker: FakeBroker,
    private readonly options: RelayOptions
  ) {}

  async runOnce(): Promise<RelayOutcome> {
    const rows = this.db.prepare(SELECT_UNPUBLISHED).all<OutboxRow>(this.options.batchSize);
    if (rows.length === 0) return { published: 0, failed: 0 };

    let published = 0;

    // One transaction for the batch, so a pass that stops half way cannot leave
    // the outbox looking strange.
    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        this.db
          .prepare('UPDATE outbox SET published_at = ? WHERE id = ?')
          .run(new Date().toISOString(), row.id);

        await this.broker.publish(row.topic, JSON.parse(row.payload) as unknown, {
          messageId: String(row.id),
        });

        published += 1;
      }
    } finally {
      this.db.exec('COMMIT');
    }

    return { published, failed: 0 };
  }
}
