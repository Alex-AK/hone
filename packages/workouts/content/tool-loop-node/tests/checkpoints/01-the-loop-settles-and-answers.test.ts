import { describe, expect, it } from 'vitest';

import type { ToolResultBlock } from '../../src/model/protocol';
import { conversation, harness } from '../support/harness';
import { INTENDED, LATE_REFUND_QUESTION, lateRefund, SETTLED_ANSWER } from '../support/transcripts';

describe('the loop settles and answers', () => {
  it('answers with the turn that stopped asking for calls', async () => {
    const { agent } = harness(lateRefund);

    await expect(agent.answer(LATE_REFUND_QUESTION)).resolves.toBe(SETTLED_ANSWER);
  });

  it('does not hand back the turn that was still asking', async () => {
    const { agent } = harness(lateRefund);

    const answer = await agent.answer(LATE_REFUND_QUESTION);

    expect(answer, 'that text was written before the refund ran').not.toContain(INTENDED);
  });

  it('runs every call the model asked for, in the order it asked', async () => {
    const { agent, store } = harness(lateRefund);

    await agent.answer(LATE_REFUND_QUESTION);

    expect(store.ran).toEqual(['get_order', 'search_policy', 'refund_order']);
    expect(store.refunds).toEqual([{ amountCents: 2400, orderId: 'A-1187' }]);
  });

  it('answers both calls of one turn in a single message', async () => {
    const { agent, model } = harness(lateRefund);

    await agent.answer(LATE_REFUND_QUESTION);

    const results = conversation(model)[2];
    expect(results?.role, 'the results go back as one user message').toBe('user');
    expect(results?.content.map((block) => block.type)).toEqual(['tool_result', 'tool_result']);
    expect((results?.content as ToolResultBlock[]).map((block) => block.tool_use_id)).toEqual([
      'call_1',
      'call_2',
    ]);
  });

  it('takes one turn per reply and no more', async () => {
    const { agent, model } = harness(lateRefund);

    await agent.answer(LATE_REFUND_QUESTION);

    expect(model.calls.length, 'two turns with calls, then the one that answered').toBe(3);
  });
});
