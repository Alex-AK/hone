/**
 * Types only, so importing this reaches nothing. The rules are free to lean on
 * it however they like.
 */

export type Level = 'first' | 'second' | 'final';

export interface Invoice {
  readonly id: string;
  readonly customerId: string;
  readonly amountPence: number;
  /** `YYYY-MM-DD`. An invoice falls due at midnight UTC on that date. */
  readonly dueDate: string;
  readonly paidAt: string | null;
}

export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly onHold: boolean;
  readonly paymentPlan: boolean;
}

export interface Reminder {
  readonly invoiceId: string;
  readonly level: Level;
  readonly sentAt: string;
}

export interface Settings {
  readonly quietDays: number;
  readonly perCustomerCap: number;
}

export interface Planned {
  readonly invoiceId: string;
  readonly customerId: string;
  readonly level: Level;
  readonly daysOverdue: number;
  readonly amountPence: number;
}
