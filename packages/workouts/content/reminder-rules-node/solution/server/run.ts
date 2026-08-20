import { type InvoiceFacts, planReminders } from './chase';
import { now } from './clock';
import type { Planned } from './model';
import { customer, openInvoices, remindersFor, settings } from './store';

/**
 * One chasing run: gather, decide, then hold the cap that stops one customer
 * opening five emails from us in a morning.
 *
 * Gathering for every open invoice fetches for a few that turn out not to be
 * due. The alternative is asking the rules twice, once for who is in scope and
 * again for what to do about them, and that is a second entry point to keep
 * honest in exchange for a handful of reads.
 */
export function chaseRun(): Planned[] {
  const asOf = now();
  const { perCustomerCap, quietDays } = settings();

  const open: InvoiceFacts[] = openInvoices().map((invoice) => ({
    invoice,
    customer: customer(invoice.customerId),
    history: remindersFor(invoice.id),
  }));

  const used = new Map<string, number>();
  const kept: Planned[] = [];

  for (const item of planReminders(asOf, quietDays, open)) {
    const already = used.get(item.customerId) ?? 0;
    if (already >= perCustomerCap) continue;
    used.set(item.customerId, already + 1);
    kept.push(item);
  }

  return kept;
}
