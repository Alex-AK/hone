import { z } from 'zod';

/**
 * What a triage decision has to be before it goes anywhere near the refund
 * queue. This is the contract: the model is asked for it, and nothing that does
 * not fit it is a decision.
 *
 * Given to you, and not part of the exercise.
 */
export const decisionSchema = z.strictObject({
  order_id: z.string().min(1),
  /** Zero is a decision. It means "no refund", and it still needs a reason. */
  refund_cents: z.int().nonnegative(),
  reason: z.string().min(1),
  /** The clause the decision rests on, or that none of them do. */
  policy: z.enum(['4.2', 'none']),
});

export type Decision = z.output<typeof decisionSchema>;
