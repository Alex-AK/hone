import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { STATUSES } from '../../src/client/contract';
import { column, columns, type Harness, open } from '../support/board';

let harness: Harness;

afterEach(() => {
  harness?.close();
});

describe('every column comes back', () => {
  it('answers with the five columns the client draws, in that order', async () => {
    harness = open('busy');

    const response = await request(harness.server).get('/board');

    expect(response.status).toBe(200);
    expect(columns(response.body).map((entry) => entry.status)).toEqual([...STATUSES]);
  });

  it('sends the column nobody has a ticket in', async () => {
    harness = open('busy');

    const response = await request(harness.server).get('/board');
    const waiting = column(response.body, 'waiting');

    expect(waiting, 'nothing is waiting on a customer, and the column is missing').toBeDefined();
    expect(waiting?.cards).toEqual([]);
  });

  it('draws all five on a board with almost nothing on it', async () => {
    harness = open('quiet');

    const response = await request(harness.server).get('/board');

    expect(columns(response.body).map((entry) => entry.status)).toEqual([...STATUSES]);
  });
});
