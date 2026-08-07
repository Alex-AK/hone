import type { Request, Response } from 'express';

import { type Board, type Card, CARDS_PER_COLUMN, STATUSES } from '../client/contract';
import type { Db } from './db';

interface CardRow {
  status: string;
  id: number;
  subject: string;
  priority: number;
  updated_at: number;
  agent_id: number | null;
  agent_name: string | null;
}

interface TotalRow {
  status: string;
  total: number;
}

/**
 * Every column's first page in one statement.
 *
 * The window numbers each status's tickets on its own, so one query answers all
 * five columns and the cost stops following the size of the board. The agent
 * comes over on the same row, which is the difference between one statement and
 * one per card. The order is the one the client draws in, and `id` settles the
 * five tickets the importer opened in the same millisecond.
 */
const CARDS_SQL = `
  SELECT status, id, subject, priority, updated_at, agent_id, agent_name
    FROM (
      SELECT t.status,
             t.id,
             t.subject,
             t.priority,
             t.updated_at,
             t.agent_id,
             a.name AS agent_name,
             ROW_NUMBER() OVER (
               PARTITION BY t.status
                   ORDER BY t.updated_at DESC, t.id DESC
             ) AS seq
        FROM tickets t
        LEFT JOIN agents a ON a.id = t.agent_id
    )
   WHERE seq <= ?
   ORDER BY status, updated_at DESC, id DESC
`;

/** What the column headings count, which is the column rather than the page. */
const TOTALS_SQL = 'SELECT status, COUNT(*) AS total FROM tickets GROUP BY status';

export function buildBoard(db: Db): Board {
  const rows = db.prepare(CARDS_SQL).all<CardRow>(CARDS_PER_COLUMN);
  const totals = db.prepare(TOTALS_SQL).all<TotalRow>();

  const cardsByStatus = new Map<string, Card[]>();
  for (const row of rows) {
    const cards = cardsByStatus.get(row.status) ?? [];
    cards.push(toCard(row));
    cardsByStatus.set(row.status, cards);
  }

  const totalByStatus = new Map(totals.map((row) => [row.status, row.total]));

  // The statuses drive this, not the rows: a column with nothing in it is a
  // column the client still draws.
  return {
    columns: STATUSES.map((status) => ({
      status,
      total: totalByStatus.get(status) ?? 0,
      cards: cardsByStatus.get(status) ?? [],
    })),
  };
}

/**
 * A row as the client declared it: ids as strings, the timestamp as ISO 8601 in
 * UTC, and `assignee` present on every card whether or not anybody owns it.
 */
function toCard(row: CardRow): Card {
  return {
    id: String(row.id),
    subject: row.subject,
    priority: row.priority,
    updatedAt: new Date(row.updated_at).toISOString(),
    assignee:
      row.agent_id === null || row.agent_name === null
        ? null
        : { id: String(row.agent_id), name: row.agent_name },
  };
}

export function createBoardHandler(db: Db) {
  return function board(_req: Request, res: Response): void {
    res.json(buildBoard(db));
  };
}
