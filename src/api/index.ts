import http from 'node:http';
import db from './db';
import { isValidEmail } from './email';

const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;
const MAX_BODY_BYTES = 1024;

// Rate limiting
//
// Each unique IP and each unique email address is allowed RATE_LIMIT_MAX
// requests within a rolling RATE_LIMIT_WINDOW_MS window.
//
// Requests that exceed the limit are SILENTLY DROPPED — the client receives
// 200 { "ok": true } identical to a successful subscription. This prevents
// abusers from detecting the limit and adjusting their strategy.
//
// Set RATE_LIMIT_ENABLED=false to disable (e.g. for local development).
// Enabled by default.
//
// Client IP is read from the X-Forwarded-For header (first entry), since this
// API is expected to run behind nginx. Falls back to the socket address.

export const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== 'false';
export const RATE_LIMIT_MAX = 10;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// How often to sweep stale entries from the rate limiter maps. Entries for
// keys that go quiet after being rate-limited are not pruned by the per-request
// path alone, so a periodic sweep prevents unbounded memory growth.
const RATE_LIMIT_SWEEP_MS = 5 * 60 * 1000; // every 5 minutes

const RES_OK = JSON.stringify({ ok: true });
const RES_TOO_LARGE = JSON.stringify({ error: 'Payload too large' });
const RES_BAD_JSON = JSON.stringify({ error: 'Invalid JSON' });
const RES_BAD_EMAIL = JSON.stringify({ error: 'Invalid email address' });
const RES_NOT_FOUND = JSON.stringify({ error: 'Not found' });

// Pre-compute Content-Length for each fixed response (ASCII-only, so byte
// length equals string length).
const HDR_OK = {
  'Content-Type': 'application/json',
  'Content-Length': String(RES_OK.length),
};
const HDR_TOO_LARGE = {
  'Content-Type': 'application/json',
  'Content-Length': String(RES_TOO_LARGE.length),
};
const HDR_BAD_JSON = {
  'Content-Type': 'application/json',
  'Content-Length': String(RES_BAD_JSON.length),
};
const HDR_BAD_EMAIL = {
  'Content-Type': 'application/json',
  'Content-Length': String(RES_BAD_EMAIL.length),
};
const HDR_NOT_FOUND = {
  'Content-Type': 'application/json',
  'Content-Length': String(RES_NOT_FOUND.length),
};

export const ipHits = new Map<string, number[]>();
export const emailHits = new Map<string, number[]>();

/**
 * Returns true if the key has exceeded the rate limit and the request should
 * be silently dropped. Records the current timestamp on each allowed request
 * and prunes expired entries to keep memory bounded.
 *
 * Pruning uses a forward scan to find the first non-expired index, then slices
 * from there — avoids allocating a new array on every hit.
 */
export function isRateLimited(
  map: Map<string, number[]>,
  key: string,
): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let hits = map.get(key) ?? [];

  // Find the first timestamp still within the window (hits are time-ordered).
  // Use strict less-than so a hit recorded exactly at windowStart is treated
  // as still within the window, not expired.
  let firstValid = 0;
  while (firstValid < hits.length && hits[firstValid] < windowStart) {
    firstValid++;
  }
  if (firstValid > 0) {
    hits = hits.slice(firstValid);
  }

  if (hits.length >= RATE_LIMIT_MAX) {
    map.set(key, hits);
    return true;
  }

  hits.push(now);
  map.set(key, hits);
  return false;
}

/**
 * Removes all entries from a rate limiter map whose entire hit array has
 * expired. Called on a periodic timer so keys that go quiet after being
 * rate-limited do not accumulate in memory indefinitely.
 */
export function sweepRateLimitMap(map: Map<string, number[]>): void {
  const windowStart = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [key, hits] of map) {
    if (hits.length === 0 || hits[hits.length - 1] < windowStart) {
      map.delete(key);
    }
  }
}

const insert = db.prepare('INSERT OR IGNORE INTO emails (email) VALUES (?)');

export const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/subscribe') {
    // Extract client IP from X-Forwarded-For (first entry) since this runs
    // behind nginx. Falls back to the raw socket address.
    const forwarded = req.headers['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    let ip: string;
    if (raw) {
      const comma = raw.indexOf(',');
      ip = comma === -1 ? raw.trim() : raw.slice(0, comma).trim();
    } else {
      ip = req.socket.remoteAddress ?? 'unknown';
    }

    if (RATE_LIMIT_ENABLED && isRateLimited(ipHits, ip)) {
      res.writeHead(200, HDR_OK);
      res.end(RES_OK);
      // Drain the request body so the socket can be reused by the client.
      req.resume();
      return;
    }

    // Accumulate raw Buffer chunks to avoid repeated string coercion.
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let tooLarge = false;

    // Ignore errors from abrupt client disconnects — the response may already
    // have been sent or the socket destroyed; there is nothing to do.
    req.on('error', () => {});

    req.on('data', (chunk: Buffer) => {
      if (tooLarge) {
        return;
      }

      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        tooLarge = true;
        res.writeHead(400, HDR_TOO_LARGE);
        res.end(RES_TOO_LARGE, () => req.socket.destroy());
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      if (tooLarge) {
        return;
      }

      const body = Buffer.concat(chunks).toString('utf8');

      let email: string;

      try {
        const parsed = JSON.parse(body);
        email = (parsed.email ?? '').trim().toLowerCase();
      } catch {
        res.writeHead(400, HDR_BAD_JSON);
        res.end(RES_BAD_JSON);
        return;
      }

      if (!isValidEmail(email)) {
        res.writeHead(400, HDR_BAD_EMAIL);
        res.end(RES_BAD_EMAIL);
        return;
      }

      if (RATE_LIMIT_ENABLED && isRateLimited(emailHits, email)) {
        res.writeHead(200, HDR_OK);
        res.end(RES_OK);
        return;
      }

      insert.run(email);

      res.writeHead(200, HDR_OK);
      res.end(RES_OK);
    });

    return;
  }

  res.writeHead(404, HDR_NOT_FOUND);
  res.end(RES_NOT_FOUND);
});

if (require.main === module) {
  // Periodic sweep of stale rate limiter entries to bound memory usage.
  // unref() so the timer does not keep the process alive on its own.
  const sweepTimer = setInterval(() => {
    sweepRateLimitMap(ipHits);
    sweepRateLimitMap(emailHits);
  }, RATE_LIMIT_SWEEP_MS);
  sweepTimer.unref();

  // Graceful shutdown: stop accepting new connections, let in-flight requests
  // finish, then close the DB so SQLite can flush and checkpoint the WAL.
  function shutdown() {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
  });
}
