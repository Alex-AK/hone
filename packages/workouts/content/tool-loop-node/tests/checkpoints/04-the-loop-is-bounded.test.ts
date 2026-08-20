import { describe, expect, it } from 'vitest';

import { LoopDidNotSettleError } from '../../src/lib/errors';
import { harness, OPTIONS, resultsSent } from '../support/harness';
import {
  BULKY_ANSWER,
  bulkyOrder,
  LATE_REFUND_QUESTION,
  neverSettles,
} from '../support/transcripts';

describe('the loop is bounded', () => {
  it('gives up on a model that will not stop asking', async () => {
    const { agent } = harness(neverSettles);

    await expect(agent.answer(LATE_REFUND_QUESTION)).rejects.toBeInstanceOf(LoopDidNotSettleError);
  });

  it('makes no more requests than the ceiling allows', async () => {
    const { agent, model } = harness(neverSettles);

    await agent.answer(LATE_REFUND_QUESTION).catch(() => undefined);

    expect(model.calls.length, 'every turn is another whole conversation, charged').toBe(
      OPTIONS.maxTurns
    );
  });

  it('settles on an order whose history does not fit the window', async () => {
    const { agent, store } = harness(bulkyOrder);

    await expect(agent.answer('Refund A-9000.')).resolves.toBe(BULKY_ANSWER);
    expect(store.refunds).toEqual([{ amountCents: 8900, orderId: 'A-9000' }]);
  });

  it('cuts a tool result down before it goes back', async () => {
    const { agent, model } = harness(bulkyOrder);

    await agent.answer('Refund A-9000.').catch(() => undefined);

    const results = resultsSent(model);
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(
        result.content.length,
        'one result cannot be allowed to fill the window'
      ).toBeLessThanOrEqual(OPTIONS.maxResultChars);
    }
    expect(results[0]?.content, 'cut the tail, not the head').toContain('A-9000');
  });
});
