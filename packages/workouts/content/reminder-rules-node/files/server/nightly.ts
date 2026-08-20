import { now } from './clock';
import type { Level } from './model';
import { chaseRun } from './run';
import { recordReminder } from './store';

export interface NightlyReport {
  readonly sent: number;
  readonly byLevel: Record<Level, number>;
}

/** The job that actually sends. It runs the same plan the preview screen shows. */
export function runNightly(): NightlyReport {
  const sentAt = now().toISOString();
  const byLevel: Record<Level, number> = { first: 0, second: 0, final: 0 };
  let sent = 0;

  for (const item of chaseRun()) {
    recordReminder(item.invoiceId, item.level, sentAt);
    byLevel[item.level] += 1;
    sent += 1;
  }

  return { sent, byLevel };
}
