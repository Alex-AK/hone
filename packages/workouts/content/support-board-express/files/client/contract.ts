import { z } from 'zod';

/**
 * The support board client, as shipped. This file is its half of the contract:
 * the columns it draws, how many cards it draws in each, and the parser it runs
 * over every response before it renders anything.
 *
 * It is in the workspace so you can read it. It is not yours to change.
 */

/** The five columns, in the order they are drawn. */
export const STATUSES = ['new', 'triaged', 'in-progress', 'waiting', 'done'] as const;

export type Status = (typeof STATUSES)[number];

/** How many cards fit in a column before the client shows "and N more". */
export const CARDS_PER_COLUMN = 10;

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const assignee = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
});

const card = z.strictObject({
  id: z.string().min(1),
  subject: z.string().min(1),
  priority: z.number().int().min(1).max(4),
  updatedAt: z
    .string()
    .regex(ISO_UTC, 'an ISO 8601 timestamp in UTC, like "2026-05-18T09:14:00.000Z"'),
  /** Present on every card. `null` is how an unassigned ticket says so. */
  assignee: assignee.nullable(),
});

const column = z.strictObject({
  status: z.enum(STATUSES),
  /** Every ticket in this status, not the number of cards sent. */
  total: z.number().int().min(0),
  cards: z.array(card).max(CARDS_PER_COLUMN),
});

/**
 * The parser is about the shape of a column rather than how many there are: the
 * client draws `STATUSES` and looks each one up, so a missing column is a gap on
 * screen rather than something it refuses.
 */
const board = z.strictObject({
  columns: z.array(column),
});

export type Card = z.infer<typeof card>;
export type Column = z.infer<typeof column>;
export type Board = z.infer<typeof board>;

/**
 * What the client runs before it renders. It throws rather than guessing,
 * because a board drawn from a payload it did not understand is a board nobody
 * can trust. Unknown fields are refused: a field the client cannot see is a
 * field somebody will start depending on without saying so.
 */
export function parseBoard(payload: unknown): Board {
  return board.parse(payload);
}
