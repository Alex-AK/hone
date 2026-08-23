/**
 * What the case set scored last time, and the thing every later run is read
 * against. A rate on its own says nothing: 78% is good news or bad news
 * depending only on what it was before.
 *
 * Given to you, and not part of the exercise.
 */
export interface Baseline {
  /** Which run this was taken from, for whoever opens the report. */
  run: string;
  /** Case id to the rate it scored. */
  rate: Record<string, number>;
}

export const MONDAY: Baseline = {
  rate: {
    'legacy-greeting': 0.9,
    'refund-window-days': 1,
    'refund-window-explained': 1,
    'refuses-account-change': 1,
    'restock-fee': 1,
    'triage-shape': 1,
  },
  run: 'monday',
};
