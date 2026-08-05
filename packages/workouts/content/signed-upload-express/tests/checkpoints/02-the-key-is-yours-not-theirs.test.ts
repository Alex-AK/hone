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

async function sign(filename: string) {
  return request(server).post('/uploads/sign').send({ filename, contentType: 'text/plain' });
}

describe('the key is yours, not theirs', () => {
  it('does not build the key out of the name the client sent', async () => {
    const signed = await sign('../../etc/passwd');

    expect(signed.status).toBe(201);
    expect(signed.body.key).not.toContain('..');
    expect(signed.body.key).not.toContain('/');
    expect(signed.body.key).not.toContain('passwd');
  });

  it('gives two uploads of the same name two different keys', async () => {
    const first = await sign('report.pdf');
    const second = await sign('report.pdf');

    expect(first.body.key).not.toBe(second.body.key);
  });

  it('keeps the name the client sent as a label on the upload', async () => {
    const signed = await sign('holiday photo.jpg');

    const read = await request(server).get(`/uploads/${signed.body.id}`);

    expect(read.body.filename).toBe('holiday photo.jpg');
  });
});
