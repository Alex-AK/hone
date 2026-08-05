import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/app';
import { resetClock } from '../../src/server/clock';
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

describe('confirm only after the object lands', () => {
  it('refuses to confirm an upload nobody made', async () => {
    const signed = await sign();

    const confirmed = await request(server).post(`/uploads/${signed.body.id}/confirm`);

    expect(confirmed.status).not.toBe(200);

    const read = await request(server).get(`/uploads/${signed.body.id}`);
    expect(read.body.status).toBe('pending');
  });

  it('confirms once the object is in the store, and records what arrived', async () => {
    const signed = await sign();

    await request(server)
      .put(signed.body.url)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('0123456789'));

    const confirmed = await request(server).post(`/uploads/${signed.body.id}/confirm`);

    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('stored');
    expect(confirmed.body.sizeBytes).toBe(10);
  });

  it('404s an id it never signed', async () => {
    const confirmed = await request(server).post('/uploads/does-not-exist/confirm');

    expect(confirmed.status).toBe(404);
  });
});
