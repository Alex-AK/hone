import type { Customer, Invoice, Level, Reminder, Settings } from './model';
import { markLoaded, record } from './probe';

markLoaded('store');

const CUSTOMERS: Customer[] = [
  { id: 'ashby', name: 'Ashby Joinery', onHold: false, paymentPlan: false },
  { id: 'brant', name: 'Brant Freight', onHold: true, paymentPlan: false },
  { id: 'crole', name: 'Crole Interiors', onHold: false, paymentPlan: true },
  { id: 'drake', name: 'Drake Signage', onHold: false, paymentPlan: false },
];

const INVOICES: Invoice[] = [
  { id: 'INV-1001', customerId: 'ashby', amountPence: 41200, dueDate: '2025-04-25', paidAt: null },
  { id: 'INV-1002', customerId: 'ashby', amountPence: 9850, dueDate: '2025-05-13', paidAt: null },
  { id: 'INV-1003', customerId: 'ashby', amountPence: 124000, dueDate: '2025-05-19', paidAt: null },
  { id: 'INV-1004', customerId: 'brant', amountPence: 301500, dueDate: '2025-04-20', paidAt: null },
  { id: 'INV-1005', customerId: 'crole', amountPence: 76000, dueDate: '2025-04-15', paidAt: null },
  { id: 'INV-1006', customerId: 'crole', amountPence: 14500, dueDate: '2025-05-18', paidAt: null },
  { id: 'INV-1007', customerId: 'drake', amountPence: 6200, dueDate: '2025-05-20', paidAt: null },
  { id: 'INV-1008', customerId: 'drake', amountPence: 89000, dueDate: '2025-05-16', paidAt: null },
  { id: 'INV-1009', customerId: 'drake', amountPence: 210000, dueDate: '2025-05-10', paidAt: null },
  {
    id: 'INV-1010',
    customerId: 'drake',
    amountPence: 45500,
    dueDate: '2025-03-01',
    paidAt: '2025-05-02T11:14:00.000Z',
  },
  { id: 'INV-1011', customerId: 'drake', amountPence: 31800, dueDate: '2025-05-12', paidAt: null },
];

const HISTORY: Reminder[] = [
  { invoiceId: 'INV-1008', level: 'first', sentAt: '2025-05-16T09:00:00.000Z' },
  { invoiceId: 'INV-1009', level: 'first', sentAt: '2025-05-19T20:00:00.000Z' },
  { invoiceId: 'INV-1011', level: 'first', sentAt: '2025-05-10T09:00:00.000Z' },
];

let sent: Reminder[] = [];

/** Forget everything this process has sent. The checkpoints call it. */
export function reset(): void {
  sent = [];
}

export function openInvoices(): Invoice[] {
  record('openInvoices()');
  return INVOICES.filter((invoice) => invoice.paidAt === null).map((invoice) => ({ ...invoice }));
}

export function customer(id: string): Customer {
  record(`customer(${id})`);
  const found = CUSTOMERS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no customer ${id}`);
  return { ...found };
}

export function remindersFor(invoiceId: string): Reminder[] {
  record(`remindersFor(${invoiceId})`);
  return [...HISTORY, ...sent]
    .filter((reminder) => reminder.invoiceId === invoiceId)
    .map((reminder) => ({ ...reminder }));
}

export function settings(): Settings {
  record('settings()');
  return { quietDays: 3, perCustomerCap: 2 };
}

export function recordReminder(invoiceId: string, level: Level, sentAt: string): void {
  record(`recordReminder(${invoiceId})`);
  sent.push({ invoiceId, level, sentAt });
}

/** What this process has sent, for the checkpoints to read. Not a query. */
export function sentReminders(): Reminder[] {
  return sent.map((reminder) => ({ ...reminder }));
}
