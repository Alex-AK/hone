import { planReminders } from './chase';
import type { Planned } from './model';
import { settings } from './store';

/**
 * One chasing run. The rules decide who is due; the run holds the cap that
 * stops one customer opening five emails from us in a morning, and it trims
 * from the bottom of the order the rules put them in.
 */
export function chaseRun(): Planned[] {
  const cap = settings().perCustomerCap;
  const used = new Map<string, number>();
  const kept: Planned[] = [];

  for (const item of planReminders()) {
    const already = used.get(item.customerId) ?? 0;
    if (already >= cap) continue;
    used.set(item.customerId, already + 1);
    kept.push(item);
  }

  return kept;
}
