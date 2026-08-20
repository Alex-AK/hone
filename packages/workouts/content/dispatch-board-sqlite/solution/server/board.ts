import type { Db } from './db';

/** One line of the dispatch board, as the page renders it. */
export interface BoardRow {
  reference: string;
  customer: string;
  status: string;
  parcelCount: number;
  totalGrams: number;
}

/** What the relay hands the board, one per change made to a consignment. */
export type Change =
  | { kind: 'consignment-booked'; consignmentId: number }
  | { kind: 'parcel-added'; consignmentId: number; weightGrams: number }
  | { kind: 'status-changed'; consignmentId: number; status: string };

interface ProjectedRow {
  id: number;
  reference: string;
  customer: string;
  status: string;
  booked_at: string;
  parcel_count: number;
  total_grams: number;
}

interface BoardRowRecord {
  reference: string;
  customer: string;
  status: string;
  parcel_count: number;
  total_grams: number;
}

/**
 * The board row a consignment should have, read from the consignment tables
 * rather than from what the change said, which is what makes applying the same
 * change twice land in the same place as applying it once.
 */
function project(db: Db, consignmentId: number): void {
  const row = db
    .prepare(
      `SELECT c.id, c.reference, c.customer, c.status, c.booked_at,
              count(p.id) AS parcel_count,
              coalesce(sum(p.weight_grams), 0) AS total_grams
       FROM consignment c
       LEFT JOIN parcel p ON p.consignment_id = c.id
       WHERE c.id = ?
       GROUP BY c.id`
    )
    .get<ProjectedRow>(consignmentId);

  if (!row) {
    db.prepare('DELETE FROM board_row WHERE consignment_id = ?').run(consignmentId);
    return;
  }

  db.prepare(
    `INSERT INTO board_row
       (consignment_id, reference, customer, status, parcel_count, total_grams, booked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (consignment_id) DO UPDATE SET
       reference = excluded.reference,
       customer = excluded.customer,
       status = excluded.status,
       parcel_count = excluded.parcel_count,
       total_grams = excluded.total_grams,
       booked_at = excluded.booked_at`
  ).run(
    row.id,
    row.reference,
    row.customer,
    row.status,
    row.parcel_count,
    row.total_grams,
    row.booked_at
  );
}

/**
 * Bring the board up to date with one change. The relay calls this once for
 * every change it reads off the consignment tables.
 */
export function applyChange(db: Db, change: Change): void {
  project(db, change.consignmentId);
}

/** Ops runs this from the admin page, with the Repair board button. */
export function rebuildBoard(db: Db): void {
  db.transaction(() => {
    db.prepare('DELETE FROM board_row').run();
    for (const row of db.prepare('SELECT id FROM consignment').all<{ id: number }>()) {
      project(db, row.id);
    }
  })();
}

/** The dispatch board, oldest booking first. This is what the page calls. */
export function listBoard(db: Db, status?: string): BoardRow[] {
  const rows = status
    ? db
        .prepare(
          `SELECT reference, customer, status, parcel_count, total_grams
           FROM board_row WHERE status = ? ORDER BY booked_at`
        )
        .all<BoardRowRecord>(status)
    : db
        .prepare(
          `SELECT reference, customer, status, parcel_count, total_grams
           FROM board_row ORDER BY booked_at`
        )
        .all<BoardRowRecord>();

  return rows.map((row) => ({
    reference: row.reference,
    customer: row.customer,
    status: row.status,
    parcelCount: row.parcel_count,
    totalGrams: row.total_grams,
  }));
}
