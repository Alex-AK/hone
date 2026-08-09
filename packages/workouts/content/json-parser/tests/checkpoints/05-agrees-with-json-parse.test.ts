import { describe, expect, it } from 'vitest';

import { parse } from '../../src/lib/parser';
import { firstDisagreement, generatedDocuments, mutatedDocuments } from '../support/differential';

/**
 * The other four checkpoints hand you documents. This one hands you a contract:
 * whatever the text is, you and `JSON.parse` answer the same. A failure prints
 * the shortest document that breaks it.
 */
describe('agreeing with JSON.parse on documents nobody wrote', () => {
  it('returns the same value for generated documents', () => {
    const disagreement = firstDisagreement(parse, generatedDocuments(20260809, 400));
    if (disagreement) expect.fail(disagreement);
  });

  it('refuses what JSON.parse refuses, one edit away from valid', () => {
    const disagreement = firstDisagreement(parse, mutatedDocuments(514229, 600));
    if (disagreement) expect.fail(disagreement);
  });
});
