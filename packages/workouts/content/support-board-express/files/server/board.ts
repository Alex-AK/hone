import type { Request, Response } from 'express';

import { CARDS_PER_COLUMN, STATUSES } from '../client/contract';
import type { Db } from './db';

interface TicketRow {
  id: number;
  subject: string;
  priority: number;
  agent_id: number | null;
  updated_at: number;
}

/**
 * `GET /board`.
 *
 * TODO: the client refuses what this answers with, and the counts under the
 * column headings are wrong. See brief.md.
 */
export function buildBoard(db: Db): unknown {
  const columns = [];

  for (const status of STATUSES) {
    const rows = db
      .prepare(
        `SELECT id, subject, priority, agent_id, updated_at
           FROM tickets
          WHERE status = ?
          ORDER BY updated_at DESC
          LIMIT ?`
      )
      .all<TicketRow>(status, CARDS_PER_COLUMN);

    if (rows.length === 0) continue;

    const cards = rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      priority: row.priority,
      updatedAt: row.updated_at,
      ...(row.agent_id === null
        ? {}
        : {
            assignee: {
              id: row.agent_id,
              name: db
                .prepare('SELECT name FROM agents WHERE id = ?')
                .get<{ name: string }>(row.agent_id)?.name,
            },
          }),
    }));

    columns.push({ status, total: cards.length, cards });
  }

  return { columns };
}

export function createBoardHandler(db: Db) {
  return function board(_req: Request, res: Response): void {
    res.json(buildBoard(db));
  };
}
