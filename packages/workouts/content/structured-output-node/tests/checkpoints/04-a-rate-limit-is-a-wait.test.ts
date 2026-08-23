import { describe, expect, it } from 'vitest';

import { RateLimitedError } from '../../src/model/protocol';
import { harness } from '../support/harness';
import { RATE_LIMITED_AFTER_THE_TOOLS, RATE_LIMITED_FOR_GOOD } from '../support/transcripts';

const QUESTION = 'Refund A-1187, it turned up four days late.';

describe('a rate limit is a wait, not a start again', () => {
  it('waits as long as it was told to, and gets its answer', async () => {
    const { clock, triage } = harness(RATE_LIMITED_AFTER_THE_TOOLS);

    const decision = await triage.decide(QUESTION);

    expect(decision.order_id).toBe('A-1187');
    expect(clock.slept, 'the provider named a number and it is not a suggestion').toEqual([
      750, 750,
    ]);
  });

  it('does not run anything a second time to get back to where it was', async () => {
    const { model, store, triage } = harness(RATE_LIMITED_AFTER_THE_TOOLS);

    await triage.decide(QUESTION);

    expect(
      store.ran,
      'the lookups ran again on the way back to a conversation that already had their answers'
    ).toEqual(['get_order', 'search_policy']);
    expect(store.refunds).toEqual([]);
    // The one that asked for lookups, two refused, and the one that got through.
    expect(model.calls).toHaveLength(4);
  });

  it('sends the same conversation each time rather than building a new one', async () => {
    const { model, triage } = harness(RATE_LIMITED_AFTER_THE_TOOLS);

    await triage.decide(QUESTION);

    const [, second, third] = model.calls;
    expect(second, 'a retry after a 429 is the same request, because nothing was read').toEqual(
      third
    );
  });

  it('stops waiting after maxWaits and lets the rate limit out', async () => {
    const { clock, triage } = harness(RATE_LIMITED_FOR_GOOD, { maxWaits: 2 });

    const thrown = await triage.decide(QUESTION).then(
      () => null,
      (error: unknown) => error
    );

    expect(thrown, 'waiting for ever is not handling a rate limit').toBeInstanceOf(
      RateLimitedError
    );
    expect(clock.slept).toEqual([750, 750]);
  });
});
