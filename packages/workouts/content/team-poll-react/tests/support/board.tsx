import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PollBoard } from '../../src/client/PollBoard';

export interface ResultRow {
  title: string;
  votes: string;
  share: string;
}

/** Every result row on screen, in the order it is drawn. */
export function rows(): ResultRow[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => {
      const cells = within(row).getAllByRole('cell');
      return {
        title: cells[0]?.textContent ?? '',
        votes: cells[1]?.textContent ?? '',
        share: cells[2]?.textContent ?? '',
      };
    });
}

export function titlesOnScreen(): string[] {
  return rows().map((row) => row.title);
}

export function votesCast(): string {
  return screen.getByLabelText('Votes cast').textContent ?? '';
}

/** Render the poll and wait for the votes already cast to arrive. */
export async function renderBoard(): Promise<{ user: ReturnType<typeof userEvent.setup> }> {
  const user = userEvent.setup({ delay: null });
  render(<PollBoard />);
  await waitFor(() => {
    expect(votesCast(), 'the poll never loaded').toBe('17');
  });
  return { user };
}

/** Choose that topic and press Vote. */
export async function vote(user: ReturnType<typeof userEvent.setup>, title: string): Promise<void> {
  await user.click(screen.getByRole('radio', { name: title }));
  await user.click(screen.getByRole('button', { name: 'Vote' }));
}
