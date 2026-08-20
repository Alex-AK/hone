import Database from 'better-sqlite3';

/** The slice of better-sqlite3 this workout uses. Every call is synchronous. */
export interface Statement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: bigint | number };
  get<T = unknown>(...params: unknown[]): T | undefined;
  all<T = unknown>(...params: unknown[]): T[];
}

export interface Db {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  /**
   * Returns a function that runs `fn` between BEGIN and COMMIT, and rolls the
   * whole thing back if `fn` throws. Call it inside another one and you get a
   * SAVEPOINT rather than a second transaction.
   */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;
  /** True while a transaction on this connection is open. */
  readonly inTransaction: boolean;
  /** The SQL of every statement run on this connection, oldest first. */
  readonly statements: string[];
  /** Empties `statements`. */
  clearStatements(): void;
}

const SCHEMA = `
  CREATE TABLE consignment (
    id INTEGER PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    customer TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('booked', 'picking', 'dispatched', 'cancelled')),
    booked_at TEXT NOT NULL
  );

  CREATE TABLE parcel (
    id INTEGER PRIMARY KEY,
    consignment_id INTEGER NOT NULL,
    barcode TEXT NOT NULL,
    weight_grams INTEGER NOT NULL
  );

  CREATE TABLE board_row (
    consignment_id INTEGER PRIMARY KEY,
    reference TEXT NOT NULL,
    customer TEXT NOT NULL,
    status TEXT NOT NULL,
    parcel_count INTEGER NOT NULL,
    total_grams INTEGER NOT NULL,
    booked_at TEXT NOT NULL
  );

  CREATE INDEX board_row_status_idx ON board_row (status, booked_at);

  INSERT INTO consignment (id, reference, customer, status, booked_at) VALUES
    (1, 'CN-4401', 'Halloway Foods', 'picking', '2026-03-02 08:10:00'),
    (2, 'CN-4402', 'Renwick Tools', 'booked', '2026-03-02 08:40:00'),
    (3, 'CN-4403', 'Aster Labs', 'dispatched', '2026-03-01 16:05:00'),
    (4, 'CN-4404', 'Halloway Foods', 'booked', '2026-03-02 09:15:00');

  INSERT INTO parcel (consignment_id, barcode, weight_grams) VALUES
    (1, 'P-90001', 1200),
    (1, 'P-90002', 900),
    (1, 'P-90003', 4300),
    (2, 'P-90004', 2500),
    (3, 'P-90005', 700),
    (3, 'P-90006', 700);

  INSERT INTO board_row
    (consignment_id, reference, customer, status, parcel_count, total_grams, booked_at) VALUES
    (1, 'CN-4401', 'Halloway Foods', 'picking', 3, 6400, '2026-03-02 08:10:00'),
    (2, 'CN-4402', 'Renwick Tools', 'booked', 1, 2500, '2026-03-02 08:40:00'),
    (3, 'CN-4403', 'Aster Labs', 'dispatched', 2, 1400, '2026-03-01 16:05:00'),
    (4, 'CN-4404', 'Halloway Foods', 'booked', 0, 0, '2026-03-02 09:15:00');
`;

/** A fresh in-memory database with four consignments and a board that agrees with them. */
export function createDb(): Db {
  const db = new Database(':memory:') as unknown as Db;
  db.exec(SCHEMA);

  const log: string[] = [];
  const prepare = db.prepare.bind(db);

  db.prepare = (sql: string): Statement => {
    const statement = prepare(sql);
    for (const method of ['run', 'get', 'all'] as const) {
      const original = statement[method].bind(statement) as (...args: unknown[]) => unknown;
      statement[method] = ((...params: unknown[]) => {
        log.push(sql);
        return original(...params);
      }) as Statement[typeof method];
    }
    return statement;
  };

  Object.defineProperty(db, 'statements', { get: () => log });
  db.clearStatements = () => {
    log.length = 0;
  };

  return db;
}
