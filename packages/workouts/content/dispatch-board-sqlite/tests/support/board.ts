import type { Db } from '../../src/server/db';

/** A board line as the tables hold it, without the timestamp the page does not show. */
export interface Line {
  consignment_id: number;
  reference: string;
  customer: string;
  status: string;
  parcel_count: number;
  total_grams: number;
}

/** What the board would say if it were worked out from the consignments right now. */
export function expectedBoard(db: Db): Line[] {
  return db
    .prepare(
      `SELECT c.id AS consignment_id, c.reference, c.customer, c.status,
              count(p.id) AS parcel_count,
              coalesce(sum(p.weight_grams), 0) AS total_grams
       FROM consignment c
       LEFT JOIN parcel p ON p.consignment_id = c.id
       GROUP BY c.id
       ORDER BY c.id`
    )
    .all<Line>();
}

/** What the board says. */
export function actualBoard(db: Db): Line[] {
  return db
    .prepare(
      `SELECT consignment_id, reference, customer, status, parcel_count, total_grams
       FROM board_row ORDER BY consignment_id`
    )
    .all<Line>();
}
