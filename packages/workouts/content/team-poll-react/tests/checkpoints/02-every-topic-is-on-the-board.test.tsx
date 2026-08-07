import { beforeEach, describe, expect, it } from 'vitest';

import { fetchPoll, fixture } from '../../src/client/api';
import { tallyVotes } from '../../src/client/tally';
import { TOPICS } from '../../src/client/topics';
import { renderBoard, rows, titlesOnScreen } from '../support/board';

beforeEach(() => {
  fixture.reset();
});

const countsByTitle = (results: ReturnType<typeof tallyVotes>): Record<string, number> =>
  Object.fromEntries(results.map((result) => [result.title, result.votes]));

describe('every topic is on the board', () => {
  it('gives a row to all five topics on the ballot', async () => {
    const { votes } = await fetchPoll();

    const results = tallyVotes(TOPICS, votes);

    expect(results, 'two topics have no votes, and both belong on the board').toHaveLength(5);
    expect(results.map((result) => result.topicId).sort((a, b) => a - b)).toEqual([
      3, 8, 12, 27, 41,
    ]);
  });

  it('counts every vote against the topic it was cast for', async () => {
    const { votes } = await fetchPoll();

    expect(countsByTitle(tallyVotes(TOPICS, votes))).toEqual({
      'Shipping behind a flag': 7,
      'Incident review, start to finish': 5,
      'Query plans without the fear': 5,
      'What our on-call actually does': 0,
      'Writing a design doc people read': 0,
    });
  });

  it('shows a topic nobody has chosen as zero rather than leaving it out', async () => {
    const { votes } = await fetchPoll();

    const quiet = tallyVotes(TOPICS, votes).find(
      (result) => result.title === 'Writing a design doc people read'
    );

    expect(quiet, 'the topic with no votes is not on the board at all').toBeDefined();
    expect(quiet?.votes).toBe(0);
    expect(quiet?.share).toBe(0);
  });

  it('is five rows of nothing before anyone has voted', () => {
    const results = tallyVotes(TOPICS, []);

    expect(results).toHaveLength(5);
    expect(results.every((result) => result.votes === 0 && result.share === 0)).toBe(true);
  });

  it('draws all five on screen', async () => {
    await renderBoard();

    expect(rows()).toHaveLength(5);
    expect(titlesOnScreen().sort()).toEqual([
      'Incident review, start to finish',
      'Query plans without the fear',
      'Shipping behind a flag',
      'What our on-call actually does',
      'Writing a design doc people read',
    ]);
  });
});
