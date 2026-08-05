import express, { type Express } from 'express';

import { createStoreRouter } from './object-store';
import { createUploadsRouter } from './uploads';

/**
 * The service, plus the object store it talks to.
 *
 * In production `/store` is somebody else's hostname. Here it is mounted on the
 * same server so a checkpoint can drive the whole round trip, but treat it as
 * remote: your process is not allowed to put the bytes there itself.
 */
export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.use('/store', createStoreRouter());
  app.use('/uploads', createUploadsRouter());

  return app;
}
