import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { type Board, parseBoard } from '../../src/client/contract';
import { column, type Harness, open } from '../support/board';

let harness: Harness;

afterEach(() => {
  harness?.close();
});

/** What the client would report, rather than a stack trace nobody can read. */
function complaints(payload: unknown): string[] {
  try {
    parseBoard(payload);
    return [];
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
}

async function board(): Promise<Board> {
  harness = open('busy');
  const response = await request(harness.server).get('/board');
  expect(complaints(response.body), 'the client refused the payload').toEqual([]);
  return parseBoard(response.body);
}

describe('the payload matches the contract', () => {
  it('parses, whatever is on the board', async () => {
    harness = open('quiet');

    const response = await request(harness.server).get('/board');

    expect(complaints(response.body)).toEqual([]);
  });

  it('sends ids as strings and timestamps as ISO 8601 in UTC', async () => {
    const parsed = await board();
    const card = parsed.columns.find((entry) => entry.status === 'new')?.cards[0];

    expect(card?.id).toBe('94');
    expect(card?.updatedAt).toBe('2026-05-18T09:29:00.000Z');
  });

  it('says an unassigned ticket is unassigned rather than leaving the field out', async () => {
    const parsed = await board();
    const cards = parsed.columns.find((entry) => entry.status === 'new')?.cards ?? [];
    const unowned = cards.find((card) => card.id === '91');

    expect(unowned?.assignee, 'ticket 91 has no agent, so assignee has to be null').toBeNull();
    expect(cards.find((card) => card.id === '94')?.assignee).toEqual({ id: '5', name: 'Ivy Chen' });
  });

  it('orders a column the way the client draws it, ties and all', async () => {
    const parsed = await board();
    const ids = parsed.columns.find((entry) => entry.status === 'new')?.cards.map((c) => c.id);

    expect(ids, 'five tickets share an updated_at, so the order needs a second key').toEqual([
      '94',
      '93',
      '92',
      '91',
      '90',
      '89',
      '88',
      '87',
      '86',
      '85',
    ]);
  });

  it('leaves the empty column parseable too', async () => {
    harness = open('busy');

    const response = await request(harness.server).get('/board');
    const waiting = column(response.body, 'waiting');

    expect(complaints(response.body)).toEqual([]);
    expect(waiting?.total).toBe(0);
  });
});
