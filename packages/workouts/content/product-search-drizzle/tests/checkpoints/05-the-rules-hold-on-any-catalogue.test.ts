import { afterAll, describe, expect, it } from 'vitest';

import { searchProducts } from '../../src/server/products';
import { closeCatalogues, firstViolation, generateCatalogues } from '../support/catalogues';

afterAll(async () => {
  await closeCatalogues();
});

describe('the rules hold on catalogues nobody wrote', () => {
  it('holds on generated catalogues', async () => {
    const violation = await firstViolation(generateCatalogues(20260822, 40), searchProducts);
    if (violation) expect.fail(violation);
  });

  it('holds on generated catalogues from a second seed', async () => {
    const violation = await firstViolation(generateCatalogues(514229, 40), searchProducts);
    if (violation) expect.fail(violation);
  });
});
