import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { fixture, posted } from '../../src/client/api';
import { renderBoard, rows, vote, votesCast } from '../support/board';

beforeEach(() => {
  fixture.reset();
});

describe('a vote is cast', () => {
  it('sends nothing while no topic is chosen', async () => {
    const { user } = await renderBoard();

    await user.click(screen.getByRole('button', { name: 'Vote' }));

    expect(posted, 'Vote with nothing chosen posted a body anyway').toEqual([]);
    expect(votesCast()).toBe('17');
  });

  it('sends the id of the chosen topic, and sends it once', async () => {
    const { user } = await renderBoard();

    await vote(user, 'What our on-call actually does');

    await waitFor(() => {
      expect(posted, 'nothing was posted').toHaveLength(1);
    });
    expect(posted[0], 'the endpoint takes the topic id as a number, under topicId').toEqual({
      topicId: 8,
    });
  });

  it('draws the board from the answer that came back', async () => {
    const { user } = await renderBoard();

    await vote(user, 'What our on-call actually does');

    await waitFor(() => {
      expect(votesCast(), 'the board still shows the poll as it was before the vote').toBe('18');
    });

    const chosen = rows().find((row) => row.title === 'What our on-call actually does');
    expect(chosen?.votes, 'the topic that was voted for has no vote against it').toBe('1');
  });

  it('does not add a vote of its own on top of the server count', async () => {
    const { user } = await renderBoard();

    await vote(user, 'Shipping behind a flag');

    await screen.findByText('Your vote is in.');

    expect(votesCast(), 'one vote was cast and the board counted it twice').toBe('18');
    const chosen = rows().find((row) => row.title === 'Shipping behind a flag');
    expect(chosen?.votes).toBe('8');
  });
});
