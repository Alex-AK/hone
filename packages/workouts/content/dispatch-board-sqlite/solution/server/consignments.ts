import { applyChange } from './board';
import type { Db } from './db';

export interface Booking {
  reference: string;
  customer: string;
}

export interface Parcel {
  consignmentId: number;
  barcode: string;
  weightGrams: number;
}

/** Book a consignment. Sales does this when the order is confirmed. */
export function bookConsignment(db: Db, booking: Booking): number {
  const info = db
    .prepare(
      `INSERT INTO consignment (reference, customer, status, booked_at)
       VALUES (?, ?, 'booked', datetime('now'))`
    )
    .run(booking.reference, booking.customer);

  const consignmentId = Number(info.lastInsertRowid);
  applyChange(db, { kind: 'consignment-booked', consignmentId });
  return consignmentId;
}

/** Scan a parcel onto a consignment. The packing bench does this all day. */
export function addParcel(db: Db, parcel: Parcel): void {
  db.prepare('INSERT INTO parcel (consignment_id, barcode, weight_grams) VALUES (?, ?, ?)').run(
    parcel.consignmentId,
    parcel.barcode,
    parcel.weightGrams
  );

  applyChange(db, {
    kind: 'parcel-added',
    consignmentId: parcel.consignmentId,
    weightGrams: parcel.weightGrams,
  });
}

/** Start picking a consignment. */
export function startPicking(db: Db, consignmentId: number): void {
  db.prepare("UPDATE consignment SET status = 'picking' WHERE id = ?").run(consignmentId);
  applyChange(db, { kind: 'status-changed', consignmentId, status: 'picking' });
}

/** The van has it. */
export function markDispatched(db: Db, consignmentId: number): void {
  db.prepare("UPDATE consignment SET status = 'dispatched' WHERE id = ?").run(consignmentId);
  applyChange(db, { kind: 'status-changed', consignmentId, status: 'dispatched' });
}

/** The customer called it off. */
export function cancelConsignment(db: Db, consignmentId: number): void {
  db.prepare("UPDATE consignment SET status = 'cancelled' WHERE id = ?").run(consignmentId);
  applyChange(db, { kind: 'status-changed', consignmentId, status: 'cancelled' });
}
