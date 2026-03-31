import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';

// Use in-memory DB for tests — must be set before importing server/db
process.env.DB_PATH = ':memory:';

const { server } = require('../api/index') as { server: http.Server };

let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

function readResponse(
  res: http.IncomingMessage,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve) => {
    let raw = '';
    res.on('data', (c) => {
      raw += c;
    });
    res.on('end', () => {
      resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
    });
  });
}

async function post(path: string, body: unknown) {
  const payload = JSON.stringify(body);
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const req = http.request(
      `${baseUrl}${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        readResponse(res).then(resolve).catch(reject);
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

async function get(path: string) {
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    http
      .get(`${baseUrl}${path}`, (res) => {
        readResponse(res).then(resolve).catch(reject);
      })
      .on('error', reject);
  });
}

async function rawPost(path: string, payload: string) {
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const req = http.request(
      `${baseUrl}${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        readResponse(res).then(resolve).catch(reject);
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

test('POST /subscribe with valid email returns 200', async () => {
  const res = await post('/subscribe', { email: 'hello@example.com' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('POST /subscribe is idempotent - duplicate returns 200', async () => {
  await post('/subscribe', { email: 'dup@example.com' });
  const res = await post('/subscribe', { email: 'dup@example.com' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('POST /subscribe normalises email to lowercase', async () => {
  const res = await post('/subscribe', { email: 'UPPER@EXAMPLE.COM' });
  assert.equal(res.status, 200);
});

test('POST /subscribe with invalid email returns 400', async () => {
  const res = await post('/subscribe', { email: 'notvalid' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'Invalid email address' });
});

test('POST /subscribe with missing email field returns 400', async () => {
  const res = await post('/subscribe', {});
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'Invalid email address' });
});

test('POST /subscribe with malformed JSON returns 400', async () => {
  const res = await rawPost('/subscribe', 'bad json{{{');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'Invalid JSON' });
});

test('unknown route returns 404', async () => {
  const res = await get('/other');
  assert.equal(res.status, 404);
});

test('POST /subscribe with body over 1024 bytes returns 400', async () => {
  const res = await rawPost('/subscribe', 'x'.repeat(1025));
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'Payload too large' });
});
