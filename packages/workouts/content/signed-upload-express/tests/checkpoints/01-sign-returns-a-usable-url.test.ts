import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/app';
import { resetClock } from '../../src/server/clock';
import { resetStore } from '../../src/server/object-store';

let server: ReturnType<ReturnType<typeof createApp>['listen']>;

// One listener for the test rather than one per request. supertest binds a fresh
// ephemeral port every time it is handed an app, so a suite that loops requests
// leaves a socket per assertion in TIME_WAIT and fails as `socket hang up` under
// the parallel load of `pnpm verify`, on a different checkpoint each run.
beforeEach(() => {
  resetClock();
  resetStore();
  server = createApp().listen(0);
});

afterEach(() => {
  server.close();
});

describe('sign returns a usable url', () => {
  it('hands back a url the store accepts a body on', async () => {
    const signed = await request(server)
      .post('/uploads/sign')
      .send({ filename: 'clip.mp4', contentType: 'video/mp4' });

    expect(signed.status).toBe(201);
    expect(typeof signed.body.url).toBe('string');

    const put = await request(server)
      .put(signed.body.url)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('pretend this is a video'));

    expect(put.status).toBe(200);
  });

  it('records the upload as pending before anything has been uploaded', async () => {
    const signed = await request(server)
      .post('/uploads/sign')
      .send({ filename: 'clip.mp4', contentType: 'video/mp4' });

    const read = await request(server).get(`/uploads/${signed.body.id}`);

    expect(read.status).toBe(200);
    expect(read.body.status).toBe('pending');
  });
});
