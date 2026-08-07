import express, { type Express } from 'express';

import { createBoardHandler } from './board';
import type { Db } from './db';

/**
 * The support service. One endpoint, and the wiring around it.
 *
 * The database is handed in rather than opened here, so a test can drive the
 * same handler against a busy board and a quiet one.
 */
export function createApp(db: Db): Express {
  const app = express();
  app.use(express.json());

  app.get('/board', createBoardHandler(db));

  return app;
}
