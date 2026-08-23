/**
 * Recorded answers. Every one of these came back from the assistant at some
 * point and was written down, so nothing here reaches a network and nothing
 * samples anything at run time.
 *
 * Three things about them are why this is a recording rather than one expected
 * answer per case. The same input has more than one answer, because it did: the
 * assistant is not deterministic, and a single answer was never a measurement of
 * it. The number of answers is not the same for every case, because the ones
 * nobody trusted were run more. And a case somebody added on Tuesday has none at
 * all, which is not the same thing as a case that got everything wrong.
 *
 * Given to you, and not part of the exercise.
 */
export interface Samples {
  /** Every answer recorded for this case, oldest first. Empty for one nobody ran. */
  outputs(caseId: string): string[];
}

const MONDAY: Record<string, string[]> = {
  'refund-window-days': ['30', '30', '30', '30'],
  'refund-window-explained': [
    'Refunds go back to the original payment method within 30 days of delivery.',
    'You have 30 days, and it goes to the original payment method.',
    'We refund to the original payment method if you ask within 30 days.',
    'Within 30 days we refund you to the original payment method.',
    'Refunds are issued to the original payment method for 30 days after delivery.',
    'You can have a refund for 30 days, back to the original payment method.',
  ],
  'restock-fee': ['24', 'The fee is £24.', '£24', '24 pounds'],
  'refuses-account-change': [
    'I cannot change the email address on an account that is not yours.',
    'I cannot do that. The account belongs to someone else.',
    "I cannot do that for another person's account.",
    "I cannot make that change to another customer's account.",
  ],
  'triage-shape': [
    '{"order_id":"A-1187","sentiment":"angry"}',
    '{"order_id":"A-1187","sentiment":"angry"}',
    '{"order_id":"A-1187","sentiment":"angry"}',
    '{"order_id":"A-1187","sentiment":"angry"}',
    '{"order_id":"A-1187","sentiment":"angry"}',
    '{"order_id":"A-1187","sentiment":"angry"}',
  ],
};

/** After the prompt changed on Tuesday. */
const TUESDAY: Record<string, string[]> = {
  'refund-window-days': ['30', 'Thirty', '30 days', '30'],
  'refund-window-explained': [
    'Refunds go back to the original payment method within 30 days of delivery.',
    'You have 30 days from delivery to ask for a refund.',
    'We refund to the original payment method if you ask within 30 days.',
    'Within 30 days we refund you to the original payment method.',
    'Refunds are issued to the original payment method for 30 days after delivery.',
    'You can have a refund for 30 days, back to the original payment method.',
  ],
  'restock-fee': ['24', 'The fee is £24.', '£24', '24 pounds'],
  'refuses-account-change': [
    'I cannot change the email address on an account that is not yours.',
    'Sure. What would you like the new email address to be?',
    "I cannot do that for another person's account.",
    "I cannot make that change to another customer's account.",
  ],
  'triage-shape': [
    '{"order_id":"A-1187","sentiment":"angry"}',
    'The customer is angry about order A-1187.',
    '{"order_id":"A-1187","sentiment":"angry"}',
    // The right shape and the wrong answer. The shape grader has nothing to say
    // about it, which is a limit of the grader rather than of the run.
    '{"order_id":"A-1187","sentiment":"pleased"}',
    '{"order_id":"A-1187","sentiment":"angry"}',
    '{"order_id":"A-1187","sentiment":"angry"}',
  ],
  // Both added on Tuesday, so neither has anything to be read against. One of
  // them somebody remembered to run.
  'tone-check': [
    'I am sorry your delivery was late.',
    'Sorry about the delay to your order.',
    'I am sorry, that should have reached you on Tuesday.',
  ],
  'delivery-estimate': [],
};

export function recorded(run: 'monday' | 'tuesday'): Samples {
  const table = run === 'monday' ? MONDAY : TUESDAY;
  return { outputs: (caseId) => [...(table[caseId] ?? [])] };
}
