import { markLoaded, record } from './probe';

markLoaded('clock');

let current = new Date('2025-05-20T09:00:00.000Z');

export function now(): Date {
  record('now()');
  return new Date(current);
}

/** The checkpoints decide what the clock says. Nothing here waits in real time. */
export function setNow(instant: string): void {
  current = new Date(instant);
}
