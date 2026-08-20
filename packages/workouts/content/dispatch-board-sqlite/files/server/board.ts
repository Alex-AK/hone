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

interface ConsignmentRow {
  id: number;
  reference: string;
  customer: string;
  status: string;
  booked_at: string;
}

interface BoardRowRecord {
  reference: string;
  customer: string;
  status: string;
  parcel_count: number;
  total_grams: number;
}

/**
 * Bring the board up to date with one change. The relay calls this once for
 * every change it reads off the consignment tables.
 */
export function applyChange(db: Db, change: Change): void {
  const consignment = db
    .prepare('SELECT id, reference, customer, status, booked_at FROM consignment WHERE id = ?')
    .get<ConsignmentRow>(change.consignmentId);
  if (!consignment) return;

  if (change.kind === 'consignment-booked') {
    db.prepare(
      `INSERT INTO board_row
         (consignment_id, reference, customer, status, parcel_count, total_grams, booked_at)
       VALUES (?, ?, ?, ?, 0, 0, ?)`
    ).run(
      consignment.id,
      consignment.reference,
      consignment.customer,
      consignment.status,
      consignment.booked_at
    );
    return;
  }

  if (change.kind === 'parcel-added') {
    db.prepare(
      `UPDATE board_row SET parcel_count = parcel_count + 1, total_grams = total_grams + ?
       WHERE consignment_id = ?`
    ).run(change.weightGrams, change.consignmentId);
    return;
  }

  db.prepare('UPDATE board_row SET status = ? WHERE consignment_id = ?').run(
    change.status,
    change.consignmentId
  );
}

/** Ops runs this from the admin page, with the Repair board button. */
export function rebuildBoard(db: Db): void {
  const missing = db
    .prepare(
      `SELECT c.id FROM consignment c
       LEFT JOIN board_row b ON b.consignment_id = c.id
       WHERE b.consignment_id IS NULL`
    )
    .all<{ id: number }>();

  for (const row of missing) {
    applyChange(db, { kind: 'consignment-booked', consignmentId: row.id });
  }
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
