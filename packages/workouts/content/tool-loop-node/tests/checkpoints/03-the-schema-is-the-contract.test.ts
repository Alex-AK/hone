import { describe, expect, it } from 'vitest';

import { harness, resultFor } from '../support/harness';
import { CORRECTED_ANSWER, LATE_REFUND_QUESTION, sloppyArguments } from '../support/transcripts';

describe('the schema is the contract', () => {
  it('answers a call for a tool that does not exist', async () => {
    const { agent, model, store } = harness(sloppyArguments);

    await agent.answer(LATE_REFUND_QUESTION);

    expect(resultFor(model, 'call_2')?.is_error, 'check_stock was retired last week').toBe(true);
    expect(store.ran).not.toContain('check_stock');
  });

  it('keeps arguments the schema does not have away from the handler', async () => {
    const { agent, store } = harness(sloppyArguments);

    await agent.answer(LATE_REFUND_QUESTION);

    expect(store.refunds, 'a total written as a string is not a total').toEqual([
      { amountCents: 2400, orderId: 'A-1187' },
    ]);
    expect(store.ran.filter((name) => name === 'refund_order').length).toBe(1);
  });

  it('says which argument was wrong', async () => {
    const { agent, model } = harness(sloppyArguments);

    await agent.answer(LATE_REFUND_QUESTION);

    const rejected = resultFor(model, 'call_3');
    expect(rejected?.is_error).toBe(true);
    expect(
      rejected?.content.includes('amount_cents') || rejected?.content.includes('reason_code'),
      'the model can only correct a call it is told the problem with'
    ).toBe(true);
  });

  it('lets the corrected call through', async () => {
    const { agent } = harness(sloppyArguments);

    await expect(agent.answer(LATE_REFUND_QUESTION)).resolves.toBe(CORRECTED_ANSWER);
  });
});
