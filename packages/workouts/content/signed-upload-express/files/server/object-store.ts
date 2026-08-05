import { createHmac, timingSafeEqual } from 'node:crypto';

import express, { Router, type Request, type Response } from 'express';

import { nowMs } from './clock';

/**
 * The object store, standing in for S3 and mounted at `/store`.
 *
 * It is not editable and it is not the exercise: read it as the specification
 * the URLs you hand out have to satisfy, the way you would read a provider's
 * documentation. Nothing here knows anything about your uploads table, and it
 * never asks who is calling. The signature is the whole of the authorisation.
 */
export const STORE_SECRET = 'store-signing-secret';

const objects = new Map<string, Buffer>();

export function objectExists(key: string): boolean {
  return objects.has(key);
}

export function objectSize(key: string): number {
  return objects.get(key)?.byteLength ?? 0;
}

export function resetStore(): void {
  objects.clear();
}

function expectedSignature(key: string, expiresAt: number): string {
  return createHmac('sha256', STORE_SECRET).update(`PUT\n${key}\n${expiresAt}`).digest('hex');
}

function signatureMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

/**
 * `PUT /store/objects/:key?expires=<ms since epoch>&signature=<hex>`
 *
 * Accepts the body and stores it under `key`, provided the signature was made
 * over this key and this expiry, and provided the expiry has not passed.
 */
export function createStoreRouter(): Router {
  const router = Router();

  router.put(
    '/objects/:key',
    express.raw({ type: '*/*', limit: '20mb' }),
    (req: Request, res: Response) => {
      const { key } = req.params;
      const expiresAt = Number(req.query.expires);
      const signature = String(req.query.signature ?? '');

      if (!Number.isFinite(expiresAt) || signature === '') {
        res.status(403).json({ error: 'unsigned' });
        return;
      }

      if (!signatureMatches(signature, expectedSignature(key, expiresAt))) {
        res.status(403).json({ error: 'signature does not match this key' });
        return;
      }

      if (nowMs() > expiresAt) {
        res.status(403).json({ error: 'url expired' });
        return;
      }

      objects.set(key, Buffer.isBuffer(req.body) ? req.body : Buffer.from(''));
      res.status(200).json({ key });
    }
  );

  return router;
}
