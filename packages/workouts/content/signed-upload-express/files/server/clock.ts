/**
 * A clock the tests own, so an expiry can be tested without waiting for one.
 *
 * Everything that needs the time reads it from here rather than from
 * `Date.now()`, which is what lets a checkpoint jump twenty minutes into the
 * future between two requests. Not editable, and not the exercise.
 */
const START = Date.UTC(2026, 0, 1, 9, 0, 0);

let current = START;

export function nowMs(): number {
  return current;
}

export function advanceMs(ms: number): void {
  current += ms;
}

export function resetClock(): void {
  current = START;
}
