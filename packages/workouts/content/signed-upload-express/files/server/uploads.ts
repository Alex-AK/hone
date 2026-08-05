import { randomUUID } from 'node:crypto';

import { Router, type Request, type Response } from 'express';

import { nowMs } from './clock';

/**
 * Uploads. This is the file to edit.
 *
 * Right now the API hands the client a URL that points at the store and nothing
 * else, and marks the upload stored as soon as anybody says so.
 */
export type Upload = {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  status: 'pending' | 'stored';
  sizeBytes: number;
};

const uploads = new Map<string, Upload>();

/** Test seam. The suites reset the table between checkpoints. */
export function resetUploads(): void {
  uploads.clear();
}

export function createUploadsRouter(): Router {
  const router = Router();

  router.post('/sign', (req: Request, res: Response) => {
    const filename = String(req.body?.filename ?? '');
    const contentType = String(req.body?.contentType ?? 'application/octet-stream');

    if (filename.trim() === '') {
      res.status(400).json({ error: 'filename is required' });
      return;
    }

    const id = randomUUID();
    const key = filename;
    const url = `/store/objects/${key}`;

    uploads.set(id, { id, key, filename, contentType, status: 'pending', sizeBytes: 0 });

    res.status(201).json({ id, key, url, signedAt: nowMs() });
  });

  router.post('/:id/confirm', (req: Request, res: Response) => {
    const upload = uploads.get(req.params.id);

    if (!upload) {
      res.status(404).json({ error: 'no such upload' });
      return;
    }

    upload.status = 'stored';

    res.status(200).json({ id: upload.id, status: upload.status, sizeBytes: upload.sizeBytes });
  });

  // Given, so a checkpoint can read the state back. Leave it alone.
  router.get('/:id', (req: Request, res: Response) => {
    const upload = uploads.get(req.params.id);

    if (!upload) {
      res.status(404).json({ error: 'no such upload' });
      return;
    }

    res.status(200).json(upload);
  });

  return router;
}
