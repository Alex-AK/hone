import { beforeEach, describe, expect, it } from 'vitest';

import { type Vote, fetchPoll, fixture } from '../../src/client/api';
import { tallyVotes } from '../../src/client/tally';
import { type Topic, TOPICS } from '../../src/client/topics';
import { renderBoard, rows } from '../support/board';

beforeEach(() => {
  fixture.reset();
});

const total = (results: ReturnType<typeof tallyVotes>): number =>
  results.reduce((sum, result) => sum + result.share, 0);

describe('the shares add up', () => {
  it('gives seventeen votes across three topics a hundred per cent', async () => {
    const { votes } = await fetchPoll();

    const results = tallyVotes(TOPICS, votes);

    expect(total(results), 'seventeen votes rounded to something other than 100').toBe(100);
    expect(results.map((result) => result.share)).toEqual([41, 30, 29, 0, 0]);
  });

  it('still adds up once one more vote has been cast', async () => {
    const { votes } = await fetchPoll();
    const withOneMore: Vote[] = [
      ...votes,
      {
        id: 'v18',
        topic: '8',
        voter: { name: 'Ana Silva', team: 'platform' },
        castAt: '2026-05-18T10:08:00.000Z',
      },
    ];

    const results = tallyVotes(TOPICS, withOneMore);

    expect(total(results)).toBe(100);
    expect(results.map((result) => result.share)).toEqual([39, 28, 28, 5, 0]);
  });

  it('hands the leftover point to the topic rounding cost the most', () => {
    const ballot: Topic[] = [
      { id: 1, title: 'Alpha' },
      { id: 2, title: 'Beta' },
      { id: 3, title: 'Gamma' },
    ];
    const votes: Vote[] = ['1', '2', '3'].map((topic, index) => ({
      id: `x${index}`,
      topic,
      voter: { name: 'Nobody', team: 'none' },
      castAt: '2026-05-18T09:00:00.000Z',
    }));

    const results = tallyVotes(ballot, votes);

    expect(total(results), 'a third each rounds to 33 three times, which is 99').toBe(100);
    expect(results.map((result) => result.share)).toEqual([34, 33, 33]);
  });

  it('is zero everywhere before anyone has voted', () => {
    const results = tallyVotes(TOPICS, []);

    expect(
      results.every((result) => result.share === 0),
      'no votes, and a share that is not zero'
    ).toBe(true);
  });

  it('shows the shares on screen', async () => {
    await renderBoard();

    expect(rows().map((row) => row.share)).toEqual(['41%', '30%', '29%', '0%', '0%']);
  });
});
