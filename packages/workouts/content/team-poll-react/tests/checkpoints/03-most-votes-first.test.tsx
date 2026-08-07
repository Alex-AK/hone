import { beforeEach, describe, expect, it } from 'vitest';

import { fetchPoll, fixture } from '../../src/client/api';
import { tallyVotes } from '../../src/client/tally';
import { TOPICS } from '../../src/client/topics';
import { renderBoard, titlesOnScreen } from '../support/board';

beforeEach(() => {
  fixture.reset();
});

const EXPECTED = [
  'Shipping behind a flag',
  'Incident review, start to finish',
  'Query plans without the fear',
  'What our on-call actually does',
  'Writing a design doc people read',
];

describe('most votes first', () => {
  it('puts the topics in order of votes', async () => {
    const { votes } = await fetchPoll();

    const titles = tallyVotes(TOPICS, votes).map((result) => result.title);

    expect(titles, 'the board is not in vote order').toEqual(EXPECTED);
  });

  it('settles a tie by title', async () => {
    const { votes } = await fetchPoll();

    const titles = tallyVotes(TOPICS, votes).map((result) => result.title);
    const tied = titles.indexOf('Incident review, start to finish');
    const alsoTied = titles.indexOf('Query plans without the fear');

    expect(tied, 'two topics have five votes each, and I is before Q').toBeLessThan(alsoTied);
  });

  it('settles a tie between two topics nobody chose the same way', async () => {
    const { votes } = await fetchPoll();

    const titles = tallyVotes(TOPICS, votes).map((result) => result.title);

    expect(titles.indexOf('What our on-call actually does')).toBeLessThan(
      titles.indexOf('Writing a design doc people read')
    );
  });

  it('leaves the ballot and the votes as it found them', async () => {
    const { votes } = await fetchPoll();
    const ballotBefore = JSON.parse(JSON.stringify(TOPICS)) as unknown;
    const votesBefore = JSON.parse(JSON.stringify(votes)) as unknown;

    tallyVotes(TOPICS, votes);

    expect(TOPICS, 'the ballot came back reordered').toEqual(ballotBefore);
    expect(votes, 'the votes came back reordered').toEqual(votesBefore);
  });

  it('draws them on screen in that order', async () => {
    await renderBoard();

    expect(titlesOnScreen()).toEqual(EXPECTED);
  });
});
