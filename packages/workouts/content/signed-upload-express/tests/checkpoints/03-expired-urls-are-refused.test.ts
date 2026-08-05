import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/app';
import { advanceMs, nowMs, resetClock } from '../../src/server/clock';
import { resetStore } from '../../src/server/object-store';

let server: ReturnType<ReturnType<typeof createApp>['listen']>;

beforeEach(() => {
  resetClock();
  resetStore();
  server = createApp().listen(0);
});

afterEach(() => {
  server.close();
});

async function sign() {
  return request(server)
    .post('/uploads/sign')
    .send({ filename: 'clip.mp4', contentType: 'video/mp4' });
}

function expiryOf(url: string): number {
  return Number(new URL(url, 'http://127.0.0.1').searchParams.get('expires'));
}

describe('expired urls are refused', () => {
  it('gives the url a life measured in minutes', async () => {
    const signed = await sign();
    const expiresAt = expiryOf(signed.body.url);

    expect(Number.isFinite(expiresAt)).toBe(true);
    expect(expiresAt).toBeGreaterThan(nowMs());
    expect(expiresAt - nowMs()).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it('is refused by the store once that life is over', async () => {
    const signed = await sign();

    advanceMs(30 * 60 * 1000);

    const put = await request(server)
      .put(signed.body.url)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('too late'));

    expect(put.status).toBe(403);
  });
});
