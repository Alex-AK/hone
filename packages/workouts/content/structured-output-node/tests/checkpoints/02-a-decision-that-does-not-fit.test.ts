import { describe, expect, it } from 'vitest';

import { NoUsableDecisionError } from '../../src/lib/errors';
import { complaints, harness } from '../support/harness';
import { A_CLAUSE_THAT_IS_NOT_THERE, NEVER_A_REAL_CLAUSE } from '../support/transcripts';

const QUESTION = 'Refund A-1187, it turned up four days late.';

describe('a decision that does not fit is sent back', () => {
  it('asks again, and takes the second answer', async () => {
    const { store, triage } = harness(A_CLAUSE_THAT_IS_NOT_THERE);

    const decision = await triage.decide(QUESTION);

    expect(decision.policy).toBe('4.2');
    expect(store.ran, 'the lookups were done once and did not need doing again').toEqual([
      'get_order',
      'search_policy',
    ]);
  });

  it('names the field that did not fit', async () => {
    const { model, triage } = harness(A_CLAUSE_THAT_IS_NOT_THERE);

    await triage.decide(QUESTION);

    const said = complaints(model);
    expect(said, 'the model was not told anything about the answer it sent').toHaveLength(1);
    expect(
      said[0],
      'an error the model cannot act on is the same as no error: name the field'
    ).toMatch(/policy/i);
  });

  it('gives up after maxRepairs, and says what the last answer was wrong about', async () => {
    const { model, triage } = harness(NEVER_A_REAL_CLAUSE, { maxRepairs: 2 });

    const thrown = await triage.decide(QUESTION).then(
      () => null,
      (error: unknown) => error
    );

    expect(thrown, 'a model that never sends a decision has to stop being asked').toBeInstanceOf(
      NoUsableDecisionError
    );
    const error = thrown as NoUsableDecisionError;
    expect(error.attempts).toBe(3);
    expect(error.last, 'the reason a person reads is the last one').toMatch(/policy/i);
    // The first ask plus two repairs, and the lookups on top.
    expect(model.calls).toHaveLength(4);
  });

  it('sends the whole conversation back, not just the complaint', async () => {
    const { model, triage } = harness(A_CLAUSE_THAT_IS_NOT_THERE);

    await triage.decide(QUESTION);

    const last = model.calls.at(-1) ?? [];
    expect(last[0]?.role).toBe('user');
    expect(
      last.filter((message) => message.role === 'assistant'),
      'the answer that did not fit is part of what the model is being corrected about'
    ).toHaveLength(2);
  });
});
