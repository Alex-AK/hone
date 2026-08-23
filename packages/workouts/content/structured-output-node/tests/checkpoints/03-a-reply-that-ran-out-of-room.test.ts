import { describe, expect, it } from 'vitest';

import { complaints, harness } from '../support/harness';
import { CUT_OFF } from '../support/transcripts';

const QUESTION = 'Refund A-1187, it turned up four days late.';

describe('a reply that ran out of room is not an answer', () => {
  it('does not take the fragment as the decision', async () => {
    const { triage } = harness(CUT_OFF);

    const decision = await triage.decide(QUESTION);

    expect(decision.reason, 'the half-written reason was read as the whole one').toBe(
      'four days late'
    );
    expect(decision.policy).toBe('4.2');
  });

  it('tells the model it was cut off rather than that it was wrong', async () => {
    const { model, triage } = harness(CUT_OFF);

    await triage.decide(QUESTION);

    // The model that wrote this made no mistake, and one told it did sends the
    // same thing again: the transcript answers a true complaint and a false one
    // differently, so what triage said is what decides whether this settles.
    expect(complaints(model)[0], 'nothing said the answer had been cut off').toMatch(
      /cut off|cut short|truncat|ran out|stopped before|unfinished|incomplete|too long|shorter|brief/i
    );
  });

  it('does not run the lookups again to get a second answer', async () => {
    const { store, triage } = harness(CUT_OFF);

    await triage.decide(QUESTION);

    expect(store.ran).toEqual(['get_order', 'search_policy']);
  });
});
