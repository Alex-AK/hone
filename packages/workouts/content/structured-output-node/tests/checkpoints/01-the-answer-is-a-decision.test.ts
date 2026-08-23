import { describe, expect, it } from 'vitest';

import { decisionSchema } from '../../src/tickets/schema';
import { harness } from '../support/harness';
import { STRAIGHTFORWARD } from '../support/transcripts';

describe('the answer is a decision, not a paragraph', () => {
  it('hands back what the schema says a decision is', async () => {
    const { store, triage } = harness(STRAIGHTFORWARD);

    const decision = await triage.decide('Refund A-1187, it turned up four days late.');

    expect(decisionSchema.safeParse(decision).success, 'that is not a decision').toBe(true);
    expect(decision).toEqual({
      order_id: 'A-1187',
      policy: '4.2',
      reason: 'four days late',
      refund_cents: 2400,
    });
    expect(store.ran, 'the model asked for two lookups and got them').toEqual([
      'get_order',
      'search_policy',
    ]);
  });

  it('runs the tools the model asked for before it decides anything', async () => {
    const { model, store, triage } = harness(STRAIGHTFORWARD);

    await triage.decide('Refund A-1187, it turned up four days late.');

    // Two requests: the one that asked for the lookups, and the one that
    // decided once it had them.
    expect(model.calls).toHaveLength(2);
    expect(store.refunds, 'nothing was refunded, because nothing asked for it').toEqual([]);
  });

  it('does not wait for anything when nothing refuses', async () => {
    const { clock, triage } = harness(STRAIGHTFORWARD);

    await triage.decide('Refund A-1187, it turned up four days late.');

    expect(clock.slept).toEqual([]);
  });
});
