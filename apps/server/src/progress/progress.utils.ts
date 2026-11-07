import type { WorkoutRun } from '@hone/shared';

/** When a workout attempt's stored last run happened, or undefined before its first run. */
export function lastRunAt(lastRun: string | null): string | undefined {
  if (!lastRun) return undefined;

  return (JSON.parse(lastRun) as WorkoutRun).ranAt;
}
