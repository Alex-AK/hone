import { now } from './clock';
import type { Level, Planned, Reminder } from './model';
import { customer, openInvoices, remindersFor, settings } from './store';

const DAY_MS = 86_400_000;

/**
 * Who gets chased, and how hard. Most overdue first, and an invoice appears at
 * most once: the level it has reached is the only reminder it gets today.
 */
export function planReminders(): Planned[] {
  const asOf = now();
  const quietDays = settings().quietDays;
  const planned: Planned[] = [];

  for (const invoice of openInvoices()) {
    const overdue = daysOverdue(invoice.dueDate, asOf);
    if (overdue < 1) continue;

    const account = customer(invoice.customerId);
    if (account.onHold) continue;

    let level = levelFor(overdue);
    if (account.paymentPlan && level !== 'first') level = 'first';

    const history = remindersFor(invoice.id);
    if (history.some((reminder) => reminder.level === level)) continue;
    if (history.some((reminder) => isQuiet(reminder, asOf, quietDays))) continue;

    planned.push({
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      level,
      daysOverdue: overdue,
      amountPence: invoice.amountPence,
    });
  }

  planned.sort((a, b) => b.daysOverdue - a.daysOverdue || a.invoiceId.localeCompare(b.invoiceId));
  return planned;
}

function daysOverdue(dueDate: string, asOf: Date): number {
  return Math.floor((asOf.getTime() - Date.parse(dueDate)) / DAY_MS);
}

function levelFor(overdue: number): Level {
  if (overdue >= 21) return 'final';
  if (overdue >= 7) return 'second';
  return 'first';
}

function isQuiet(reminder: Reminder, asOf: Date, quietDays: number): boolean {
  return asOf.getTime() - Date.parse(reminder.sentAt) < quietDays * DAY_MS;
}
