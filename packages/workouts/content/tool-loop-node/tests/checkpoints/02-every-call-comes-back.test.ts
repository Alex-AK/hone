import { describe, expect, it } from 'vitest';

import { harness, resultFor } from '../support/harness';
import { INJECTED_ANSWER, injectedRefund, LATE_REFUND_QUESTION } from '../support/transcripts';

describe('every call comes back', () => {
  it('carries on after a handler throws', async () => {
    const { agent } = harness(injectedRefund);

    await expect(
      agent.answer(LATE_REFUND_QUESTION),
      'a failed call ends the call, not the conversation'
    ).resolves.toBe(INJECTED_ANSWER);
  });

  it('marks the call that failed rather than dropping it', async () => {
    const { agent, model } = harness(injectedRefund);

    await agent.answer(LATE_REFUND_QUESTION);

    const refused = resultFor(model, 'call_4');
    expect(refused?.is_error, 'the model is waiting on an answer for every call').toBe(true);
    expect(refused?.content, 'send back what went wrong, not "failed"').toContain('B-2001');
  });

  it('still runs the call beside it that was fine', async () => {
    const { agent, model, store } = harness(injectedRefund);

    await agent.answer(LATE_REFUND_QUESTION);

    expect(store.refunds).toEqual([{ amountCents: 2400, orderId: 'A-1187' }]);
    expect(resultFor(model, 'call_3')?.is_error).toBeUndefined();
  });

  it('refunds nothing the signed-in session does not own', async () => {
    const { agent, store } = harness(injectedRefund);

    await agent.answer(LATE_REFUND_QUESTION);

    expect(
      store.refunds.map((refund) => refund.orderId),
      'the policy document asked for B-2001 and the model passed it on'
    ).not.toContain('B-2001');
  });
});
