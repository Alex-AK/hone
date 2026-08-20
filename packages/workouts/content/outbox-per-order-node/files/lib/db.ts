import Database from 'better-sqlite3';

/** One row of the outbox, as the relay reads it. */
export interface OutboxRow {
  id: number;
  topic: string;
  /** JSON. The relay parses it on the way past. */
  payload: string;
  published_at: string | null;
}

/** The slice of better-sqlite3 this workout uses. Every call is synchronous. */
export interface Statement {
  run(...params: unknown[]): { changes: number };
  get<T = unknown>(...params: unknown[]): T | undefined;
  all<T = unknown>(...params: unknown[]): T[];
}

export interface Db {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  /** True while a transaction on this connection is open. */
  readonly inTransaction: boolean;
  /**
   * Test-only. The next prepared statement whose SQL contains `fragment` throws
   * instead of running, and the arming is spent. `skip` lets that many matching
   * statements through first, which is how a checkpoint breaks the middle of a
   * batch rather than the start of one.
   */
  failNextWrite(fragment: string, skip?: number): void;
}

/**
 * An orders table and its outbox, in memory. Given to you, and not part of the
 * exercise.
 *
 * The writer is already correct and you are not being asked to change it: an
 * order and its outbox row are inserted in one transaction, so the outbox never
 * describes an order that does not exist. What has never worked is the other
 * half, which is getting those rows to the broker.
 */
export function openDb(): Db {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE orders (
      id     INTEGER PRIMARY KEY,
      total  INTEGER NOT NULL
    );
    CREATE TABLE outbox (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      topic        TEXT NOT NULL,
      payload      TEXT NOT NULL,
      published_at TEXT
    );
  `);

  let armed: { fragment: string; skip: number } | null = null;

  return {
    prepare(sql: string): Statement {
      const statement = db.prepare(sql);
      return {
        run(...params: unknown[]) {
          if (armed && sql.includes(armed.fragment)) {
            if (armed.skip > 0) {
              armed.skip -= 1;
            } else {
              armed = null;
              throw new Error(`the process died before "${sql.trim().slice(0, 40)}…" landed`);
            }
          }
          return statement.run(...(params as never[]));
        },
        get<T>(...params: unknown[]) {
          return statement.get(...(params as never[])) as T | undefined;
        },
        all<T>(...params: unknown[]) {
          return statement.all(...(params as never[])) as T[];
        },
      };
    },
    exec(sql: string): void {
      db.exec(sql);
    },
    get inTransaction(): boolean {
      return db.inTransaction;
    },
    failNextWrite(fragment: string, skip = 0): void {
      armed = { fragment, skip };
    },
  };
}

/**
 * The writer, already correct. The order and the row describing it commit
 * together or not at all, which is the half of the outbox pattern that works.
 */
export function placeOrder(db: Db, total: number): number {
  db.exec('BEGIN');
  try {
    const order = db.prepare('INSERT INTO orders (total) VALUES (?)');
    order.run(total);
    const id = db.prepare('SELECT last_insert_rowid() AS id').get<{ id: number }>()?.id ?? 0;
    db.prepare('INSERT INTO outbox (topic, payload) VALUES (?, ?)').run(
      'order.placed',
      JSON.stringify({ orderId: id, total })
    );
    db.exec('COMMIT');
    return id;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
