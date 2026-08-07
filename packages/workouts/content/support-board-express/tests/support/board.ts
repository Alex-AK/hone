import type { Server } from 'node:http';

import { createApp } from '../../src/server/app';
import { type BoardSize, createDb, type Db } from '../../src/server/db';

export interface Harness {
  db: Db;
  server: Server;
  close(): void;
}

/**
 * One listener for the test rather than one per request. supertest binds a fresh
 * ephemeral port every time it is handed an app, so a suite that loops requests
 * leaves a socket per assertion in TIME_WAIT and fails as `socket hang up` under
 * the parallel load of a full run.
 */
export function open(size: BoardSize = 'busy'): Harness {
  const db = createDb(size);
  const server = createApp(db).listen(0) as Server;
  return {
    db,
    server,
    close(): void {
      server.close();
    },
  };
}

export interface LooseColumn {
  status?: unknown;
  total?: unknown;
  cards?: unknown[];
}

/** The columns as they came over, without assuming anything about their shape. */
export function columns(body: unknown): LooseColumn[] {
  const value = (body as { columns?: unknown }).columns;
  return Array.isArray(value) ? (value as LooseColumn[]) : [];
}

export function column(body: unknown, status: string): LooseColumn | undefined {
  return columns(body).find((entry) => entry.status === status);
}
