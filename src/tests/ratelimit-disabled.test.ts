import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';

process.env.DB_PATH = ':memory:';
process.env.RATE_LIMIT_ENABLED = 'false';

const { server, ipHits, RATE_LIMIT_MAX } = require('../api/index') as {
  server: http.Server;
  ipHits: Map<string, number[]>;
  RATE_LIMIT_MAX: number;
};

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

async function subscribe(email: string) {
  const payload = JSON.stringify({ email });
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const req = http.request(
      `${baseUrl}/subscribe`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
        });
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

test('all requests succeed when RATE_LIMIT_ENABLED=false', async () => {
  // Send more than RATE_LIMIT_MAX requests for the same email
  for (let i = 0; i <= RATE_LIMIT_MAX; i++) {
    const res = await subscribe(`disabled${i}@example.com`);
    assert.equal(res.status, 200);
  }
  // No IP hits should have been recorded
  assert.equal(ipHits.size, 0);
});
