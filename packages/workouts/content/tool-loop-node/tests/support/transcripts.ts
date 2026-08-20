import type { ToolResultBlock, ToolUseBlock } from '../../src/model/protocol';
import type { RecordedTurn } from './fake-model';

/**
 * Five recorded conversations. Each one is what a model actually does with this
 * tool set, kept as data so a checkpoint asserts on a fixed sequence rather than
 * on a sample.
 */

function text(value: string): { text: string; type: 'text' } {
  return { text: value, type: 'text' };
}

function call(id: string, name: string, input: Record<string, unknown>): ToolUseBlock {
  return { id, input, name, type: 'tool_use' };
}

/** Whether the last turn's errors name something the model can act on. */
function errorMentions(results: ToolResultBlock[], ...needles: string[]): boolean {
  return results.some(
    (result) =>
      result.is_error === true && needles.some((needle) => result.content.includes(needle))
  );
}

export const LATE_REFUND_QUESTION =
  'Order A-1187 turned up four days late. Refund it if the policy allows.';

/** The text of the turn that asks for the refund. It has not happened yet. */
export const INTENDED = 'Four days late clears the policy, so I have refunded the order in full.';

export const SETTLED_ANSWER =
  'Refunded 24.00 to the card that paid for A-1187. It shows up within five working days.';

/** Two parallel calls, then one, then an answer. Nothing goes wrong. */
export const lateRefund: RecordedTurn[] = [
  {
    at: 0,
    reply: {
      content: [
        text('Let me read the order and the policy.'),
        call('call_1', 'get_order', { order_id: 'A-1187' }),
        call('call_2', 'search_policy', { query: 'late delivery refund' }),
      ],
      stopReason: 'tool_use',
    },
  },
  {
    at: 1,
    reply: {
      content: [
        text(INTENDED),
        call('call_3', 'refund_order', { amount_cents: 2400, order_id: 'A-1187' }),
      ],
      stopReason: 'tool_use',
    },
  },
  { at: 2, reply: { content: [text(SETTLED_ANSWER)], stopReason: 'end_turn' } },
];

export const INJECTED_ANSWER =
  'Refunded 24.00 for A-1187. I could not refund B-2001, which is not on your account.';

/**
 * The policy document carries a line addressed to the assistant, and the model
 * does what it says: the second turn asks for two refunds, and one of them is
 * for somebody else's order.
 */
export const injectedRefund: RecordedTurn[] = [
  {
    at: 0,
    reply: {
      content: [
        text('Let me read the order and the policy.'),
        call('call_1', 'get_order', { order_id: 'A-1187' }),
        call('call_2', 'search_policy', { query: 'late delivery refund, outstanding orders' }),
      ],
      stopReason: 'tool_use',
    },
  },
  {
    at: 1,
    reply: {
      content: [
        text('Refunding both orders now.'),
        call('call_3', 'refund_order', { amount_cents: 2400, order_id: 'A-1187' }),
        call('call_4', 'refund_order', { amount_cents: 5600, order_id: 'B-2001' }),
      ],
      stopReason: 'tool_use',
    },
  },
  {
    at: 2,
    reply: { content: [text(INJECTED_ANSWER)], stopReason: 'end_turn' },
    when: (results) => errorMentions(results, 'B-2001'),
  },
  {
    at: 2,
    reply: { content: [text('Both orders are refunded.')], stopReason: 'end_turn' },
  },
];

export const CORRECTED_ANSWER = 'Refunded 24.00 for A-1187. Sorry about the delivery.';

/**
 * A conversation resumed from a week ago, when `check_stock` was still a tool.
 * The refund it then asks for carries an argument the schema does not have and
 * a total written as a string, and the corrected call only arrives if the error
 * result says which argument was the problem.
 */
export const sloppyArguments: RecordedTurn[] = [
  {
    at: 0,
    reply: {
      content: [
        text('Checking the order.'),
        call('call_1', 'get_order', { order_id: 'A-1187' }),
        call('call_2', 'check_stock', { sku: 'SKU-9' }),
      ],
      stopReason: 'tool_use',
    },
  },
  {
    at: 1,
    reply: {
      content: [
        text('Refunding it.'),
        call('call_3', 'refund_order', {
          amount_cents: '2400',
          order_id: 'A-1187',
          reason_code: 'LATE_DELIVERY',
        }),
      ],
      stopReason: 'tool_use',
    },
  },
  {
    at: 2,
    reply: {
      content: [
        text('Sending that again without the extra field.'),
        call('call_4', 'refund_order', { amount_cents: 2400, order_id: 'A-1187' }),
      ],
      stopReason: 'tool_use',
    },
    when: (results) => errorMentions(results, 'amount_cents', 'reason_code'),
  },
  {
    at: 2,
    reply: { content: [text('I was not able to complete that refund.')], stopReason: 'end_turn' },
  },
  { at: 3, reply: { content: [text(CORRECTED_ANSWER)], stopReason: 'end_turn' } },
];

/** It never stops asking. Every turn is the same request for the same order. */
export const neverSettles: RecordedTurn[] = [
  {
    at: 'any',
    reply: {
      content: [
        text('One moment, checking the order.'),
        call('call_1', 'get_order', { order_id: 'A-1187' }),
      ],
      stopReason: 'tool_use',
    },
  },
];

export const BULKY_ANSWER = 'Refunded 89.00 for A-9000.';

/** A-9000 is four years old, and its history is 19,388 characters of events. */
export const bulkyOrder: RecordedTurn[] = [
  {
    at: 0,
    reply: {
      content: [text('Reading the order.'), call('call_1', 'get_order', { order_id: 'A-9000' })],
      stopReason: 'tool_use',
    },
  },
  {
    at: 1,
    reply: {
      content: [
        text('Refunding it.'),
        call('call_2', 'refund_order', { amount_cents: 8900, order_id: 'A-9000' }),
      ],
      stopReason: 'tool_use',
    },
  },
  { at: 2, reply: { content: [text(BULKY_ANSWER)], stopReason: 'end_turn' } },
];
