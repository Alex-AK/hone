import type { ModelReply } from '../../src/model/protocol';
import type { RecordedTurn } from './fake-model';

/**
 * Recorded conversations. Every reply here was written down rather than
 * sampled, so a checkpoint that fails fails for the reason it says.
 *
 * The one place a transcript reads what triage said is `told`, and it is the
 * point of two of these: a model handed a complaint that is true of its answer
 * does something different from a model handed one that is not. Being cut off
 * is not a mistake, so a model told its answer was invalid sends the same
 * answer again.
 */

/** What the model asks for before it decides anything. */
const LOOKS_THINGS_UP: ModelReply = {
  content: [
    { text: 'Let me look at the order and the policy.', type: 'text' },
    { id: 'call_1', input: { order_id: 'A-1187' }, name: 'get_order', type: 'tool_use' },
    {
      id: 'call_2',
      input: { query: 'late delivery refund' },
      name: 'search_policy',
      type: 'tool_use',
    },
  ],
  stopReason: 'tool_use',
};

const DECIDES: ModelReply = {
  content: [
    {
      text: '{"order_id":"A-1187","refund_cents":2400,"reason":"four days late","policy":"4.2"}',
      type: 'text',
    },
  ],
  stopReason: 'end_turn',
};

/** The clause is not one of the two the schema allows. */
const DECIDES_ON_A_CLAUSE_THAT_IS_NOT_THERE: ModelReply = {
  content: [
    {
      text: '{"order_id":"A-1187","refund_cents":2400,"reason":"four days late","policy":"4.9"}',
      type: 'text',
    },
  ],
  stopReason: 'end_turn',
};

/**
 * The completion limit landed in the middle of the reason. Nothing about this
 * is wrong: it is the front of an answer that was still being written.
 */
const RUNS_OUT_OF_ROOM: ModelReply = {
  content: [
    {
      text: '{"order_id":"A-1187","refund_cents":2400,"reason":"the order was delivered four days late, and refund policy 4.2 says an order delivered three or more days la',
      type: 'text',
    },
  ],
  stopReason: 'max_tokens',
};

/**
 * What triage has to get across for the model to do anything differently. The
 * brief asks for it in as many words, and this accepts any of the ordinary ways
 * of saying it rather than one form of words.
 */
const HEARD_IT_WAS_CUT_OFF = (text: string): boolean =>
  /cut off|cut short|truncat|ran out|stopped before|unfinished|incomplete|too long|shorter|brief/i.test(
    text
  );

/** Nothing goes wrong. */
export const STRAIGHTFORWARD: RecordedTurn[] = [
  { at: 0, reply: LOOKS_THINGS_UP },
  { at: 1, reply: DECIDES },
];

/** The first decision names a clause that does not exist, and the second does not. */
export const A_CLAUSE_THAT_IS_NOT_THERE: RecordedTurn[] = [
  { at: 0, reply: LOOKS_THINGS_UP },
  { at: 1, reply: DECIDES_ON_A_CLAUSE_THAT_IS_NOT_THERE },
  { at: 2, reply: DECIDES },
];

/** Every decision names a clause that does not exist, for as long as it is asked. */
export const NEVER_A_REAL_CLAUSE: RecordedTurn[] = [
  { at: 0, reply: LOOKS_THINGS_UP },
  { at: 'any', reply: DECIDES_ON_A_CLAUSE_THAT_IS_NOT_THERE },
];

/**
 * The decision is cut off, and the model does the same thing again unless it is
 * told what actually happened.
 */
export const CUT_OFF: RecordedTurn[] = [
  { at: 0, reply: LOOKS_THINGS_UP },
  { at: 1, reply: RUNS_OUT_OF_ROOM },
  { at: 'any', reply: DECIDES, told: HEARD_IT_WAS_CUT_OFF },
  { at: 'any', reply: RUNS_OUT_OF_ROOM },
];

/** The provider refuses the request that comes after the tools have run. */
export const RATE_LIMITED_AFTER_THE_TOOLS: RecordedTurn[] = [
  { at: 0, reply: LOOKS_THINGS_UP },
  { at: 1, refuse: { retryAfterMs: 750, times: 2 }, reply: DECIDES },
];

/** The provider never lets the second request through. */
export const RATE_LIMITED_FOR_GOOD: RecordedTurn[] = [
  { at: 0, reply: LOOKS_THINGS_UP },
  { at: 1, refuse: { retryAfterMs: 750, times: 99 }, reply: DECIDES },
];
