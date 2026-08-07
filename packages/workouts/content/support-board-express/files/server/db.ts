import Database from 'better-sqlite3';

/** The slice of better-sqlite3 this workout uses. Every call is synchronous. */
export interface Statement {
  get<T = unknown>(...params: unknown[]): T | undefined;
  all<T = unknown>(...params: unknown[]): T[];
}

export interface Db {
  prepare(sql: string): Statement;
  /**
   * Every statement this request has run, in order, newest last. The checkpoints
   * read it and clear it. Preparing a statement costs nothing here; a query
   * lands in the log when it is executed.
   */
  queries: string[];
}

const SCHEMA = `
  CREATE TABLE agents (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE tickets (
    id INTEGER PRIMARY KEY,
    subject TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('new', 'triaged', 'in-progress', 'waiting', 'done')),
    priority INTEGER NOT NULL,
    agent_id INTEGER REFERENCES agents (id),
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX tickets_board_idx ON tickets (status, updated_at DESC, id DESC);
`;

const AGENTS = [
  'Priya Raman',
  'Tom Beckett',
  'Lena Fischer',
  'Sam Okoro',
  'Ivy Chen',
  'Marc Dubois',
];

const SUBJECTS = [
  'Cannot sign in after password reset',
  'Invoice 4471 shows the wrong VAT',
  'Export finishes but the file is empty',
  'Webhook retries every four minutes',
  'Seats not released when a user is removed',
  'Two-factor codes rejected on Android',
  'Report totals differ from the dashboard',
  'Bulk import stopped at row 2000',
  'Custom domain stuck on pending',
  'Search misses tickets with an apostrophe',
  'Billing address will not save',
];

/** How many tickets sit in each status on the board the team actually has. */
const BUSY: Array<[string, number]> = [
  ['done', 41],
  ['in-progress', 7],
  ['triaged', 12],
  ['new', 29],
];

const QUIET: Array<[string, number]> = [
  ['done', 1],
  ['in-progress', 1],
  ['triaged', 1],
  ['new', 2],
];

const START_AT = Date.UTC(2026, 4, 18, 8, 0, 0);
const ONE_MINUTE = 60 * 1000;

/**
 * The five tickets the mail importer opened in one go on Monday morning. They
 * carry the same `updated_at` to the millisecond, which is the only place on
 * this board where two tickets are equally recent.
 */
export const BULK_IMPORT_SIZE = 5;

export type BoardSize = 'busy' | 'quiet';

/**
 * A fresh in-memory database, seeded identically every time. `busy` is the board
 * as it stands, 94 tickets across four of the five statuses; `quiet` is the same
 * shape with five tickets in it.
 */
export function createDb(size: BoardSize = 'busy'): Db {
  const database = new Database(':memory:');
  database.exec(SCHEMA);

  const insertAgent = database.prepare('INSERT INTO agents (id, name) VALUES (?, ?)');
  AGENTS.forEach((name, index) => insertAgent.run(index + 1, name));

  const insertTicket = database.prepare(
    'INSERT INTO tickets (subject, status, priority, agent_id, updated_at) VALUES (?, ?, ?, ?, ?)'
  );

  let id = 0;
  let updatedAt = START_AT;
  const add = (status: string, at: number): void => {
    id += 1;
    insertTicket.run(
      SUBJECTS[id % SUBJECTS.length],
      status,
      (id % 4) + 1,
      id % 7 === 0 ? null : (id % 6) + 1,
      at
    );
  };

  for (const [status, count] of size === 'busy' ? BUSY : QUIET) {
    for (let i = 0; i < count; i += 1) {
      add(status, updatedAt);
      updatedAt += ONE_MINUTE;
    }
  }

  if (size === 'busy') {
    for (let i = 0; i < BULK_IMPORT_SIZE; i += 1) add('new', updatedAt);
  }

  return instrument(database);
}

/**
 * The query log. A real service reads this off the driver; here it is a wrapper,
 * and the seed above is deliberately outside it so a board request starts from
 * an empty log.
 */
function instrument(database: Database.Database): Db {
  const queries: string[] = [];

  return {
    queries,
    prepare(sql: string): Statement {
      const statement = database.prepare(sql);
      return {
        get<T>(...params: unknown[]): T | undefined {
          queries.push(sql);
          return statement.get(...params) as T | undefined;
        },
        all<T>(...params: unknown[]): T[] {
          queries.push(sql);
          return statement.all(...params) as T[];
        },
      };
    },
  };
}
