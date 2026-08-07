import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { type BoardSize } from '../../src/server/db';
import { type Harness, open } from '../support/board';

let harness: Harness;

afterEach(() => {
  harness?.close();
});

/** The statements one board request runs, with the seeding left out of the count. */
async function statements(size: BoardSize): Promise<string[]> {
  harness = open(size);
  harness.db.queries.length = 0;
  await request(harness.server).get('/board');
  return [...harness.db.queries];
}

describe('a busy board costs the same', () => {
  it('runs the same number of statements on 94 tickets as on 5', async () => {
    const busy = await statements('busy');
    harness.close();
    const quiet = await statements('quiet');

    expect(
      busy.length,
      `5 tickets took ${quiet.length} statements and 94 took ${busy.length}`
    ).toBe(quiet.length);
  });

  it('asks the agents table for names once, not once a card', async () => {
    const queries = await statements('busy');
    const agentQueries = queries.filter((sql) => /\bagents\b/i.test(sql));

    expect(
      agentQueries.length,
      `37 cards came back and the agents table was queried ${agentQueries.length} times`
    ).toBeLessThanOrEqual(1);
  });

  it('serves the whole board in a handful of statements', async () => {
    const queries = await statements('busy');

    expect(queries.length, `the board took ${queries.length} statements`).toBeLessThanOrEqual(8);
  });
});
