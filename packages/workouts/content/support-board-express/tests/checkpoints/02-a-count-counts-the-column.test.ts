import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { CARDS_PER_COLUMN } from '../../src/client/contract';
import { columns, type Harness, open } from '../support/board';

let harness: Harness;

afterEach(() => {
  harness?.close();
});

const byStatus = (
  body: unknown,
  read: (column: { total?: unknown; cards?: unknown[] }) => unknown
) => Object.fromEntries(columns(body).map((entry) => [entry.status, read(entry)]));

describe('a count counts the column', () => {
  it('counts every ticket in the status, not the cards it sent', async () => {
    harness = open('busy');

    const response = await request(harness.server).get('/board');

    expect(byStatus(response.body, (entry) => entry.total)).toEqual({
      new: 34,
      triaged: 12,
      'in-progress': 7,
      waiting: 0,
      done: 41,
    });
  });

  it('still sends only a page of cards', async () => {
    harness = open('busy');

    const response = await request(harness.server).get('/board');

    expect(byStatus(response.body, (entry) => entry.cards?.length)).toEqual({
      new: CARDS_PER_COLUMN,
      triaged: CARDS_PER_COLUMN,
      'in-progress': 7,
      waiting: 0,
      done: CARDS_PER_COLUMN,
    });
  });

  it('agrees with itself when the column fits in one page', async () => {
    harness = open('quiet');

    const response = await request(harness.server).get('/board');

    for (const entry of columns(response.body)) {
      expect(entry.total, `${String(entry.status)} counted its cards, not its column`).toBe(
        entry.cards?.length
      );
    }
  });
});
