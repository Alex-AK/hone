import { createHmac, randomUUID } from 'node:crypto';

import { Router, type Request, type Response } from 'express';

import { nowMs } from './clock';
import { objectExists, objectSize, STORE_SECRET } from './object-store';

/**
 * Uploads. This is the file to edit.
 *
 * The API never carries the bytes. It hands out a URL the store will accept,
 * for one key, for five minutes, and records what it is expecting; the upload
 * becomes real only once the object is actually there.
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

const URL_TTL_MS = 5 * 60 * 1000;

/** Test seam. The suites reset the table between checkpoints. */
export function resetUploads(): void {
  uploads.clear();
}

// The store verifies exactly this string. Signing anything less specific is
// what lets one URL be pointed at somebody else's key.
function sign(key: string, expiresAt: number): string {
  return createHmac('sha256', STORE_SECRET).update(`PUT\n${key}\n${expiresAt}`).digest('hex');
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
    const key = `upload-${randomUUID()}`;
    const expiresAt = nowMs() + URL_TTL_MS;
    const url = `/store/objects/${key}?expires=${expiresAt}&signature=${sign(key, expiresAt)}`;

    uploads.set(id, { id, key, filename, contentType, status: 'pending', sizeBytes: 0 });

    res.status(201).json({ id, key, url, expiresAt });
  });

  router.post('/:id/confirm', (req: Request, res: Response) => {
    const upload = uploads.get(req.params.id);

    if (!upload) {
      res.status(404).json({ error: 'no such upload' });
      return;
    }

    if (!objectExists(upload.key)) {
      res.status(409).json({ error: 'nothing was uploaded', status: upload.status });
      return;
    }

    upload.status = 'stored';
    upload.sizeBytes = objectSize(upload.key);

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
