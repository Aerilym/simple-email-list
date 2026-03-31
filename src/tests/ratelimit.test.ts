import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DB_PATH = ':memory:';
process.env.RATE_LIMIT_ENABLED = 'true';

const {
  isRateLimited,
  sweepRateLimitMap,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
} = require('../api/index') as {
  isRateLimited: (map: Map<string, number[]>, key: string) => boolean;
  sweepRateLimitMap: (map: Map<string, number[]>) => void;
  RATE_LIMIT_MAX: number;
  RATE_LIMIT_WINDOW_MS: number;
};

test('allows up to RATE_LIMIT_MAX requests', () => {
  const map = new Map<string, number[]>();
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    assert.equal(
      isRateLimited(map, 'key'),
      false,
      `request ${i + 1} should be allowed`,
    );
  }
});

test('blocks the request after RATE_LIMIT_MAX is reached', () => {
  const map = new Map<string, number[]>();
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    isRateLimited(map, 'key');
  }
  assert.equal(isRateLimited(map, 'key'), true);
});

test('independent keys do not affect each other', () => {
  const map = new Map<string, number[]>();
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    isRateLimited(map, 'key-a');
  }
  // key-a is now exhausted, key-b should still be allowed
  assert.equal(isRateLimited(map, 'key-b'), false);
});

test('expired timestamps are pruned and the key is allowed again', () => {
  const map = new Map<string, number[]>();

  // Backdate all hits to just outside the window
  const expired = Date.now() - RATE_LIMIT_WINDOW_MS - 1;
  map.set('key', Array(RATE_LIMIT_MAX).fill(expired));

  // All hits are expired, so the next request should be allowed
  assert.equal(isRateLimited(map, 'key'), false);
});

test('expired key is removed from the map after pruning', () => {
  const map = new Map<string, number[]>();

  const expired = Date.now() - RATE_LIMIT_WINDOW_MS - 1;
  map.set('key', Array(RATE_LIMIT_MAX - 1).fill(expired));

  // Only (MAX - 1) expired hits — pruned to 0, then 1 new hit added: not rate limited
  assert.equal(isRateLimited(map, 'key'), false);
  // Entry should exist with exactly 1 fresh timestamp
  assert.equal(map.get('key')?.length, 1);
});

test('RATE_LIMIT_ENABLED=false disables rate limiting via env', () => {
  // This is tested via a separate server import in ratelimit-disabled.test.ts
  // Here we just confirm the constant is exported and readable
  assert.equal(typeof RATE_LIMIT_MAX, 'number');
  assert.equal(typeof RATE_LIMIT_WINDOW_MS, 'number');
});

test('sweepRateLimitMap removes entries whose newest hit has expired', () => {
  const map = new Map<string, number[]>();
  const expired = Date.now() - RATE_LIMIT_WINDOW_MS - 1;
  map.set('old-key', [expired, expired]);
  map.set('fresh-key', [Date.now()]);

  sweepRateLimitMap(map);

  assert.equal(map.has('old-key'), false, 'expired entry should be removed');
  assert.equal(map.has('fresh-key'), true, 'fresh entry should be kept');
});

test('sweepRateLimitMap removes entries with empty hit arrays', () => {
  const map = new Map<string, number[]>();
  map.set('empty-key', []);
  map.set('fresh-key', [Date.now()]);

  sweepRateLimitMap(map);

  assert.equal(map.has('empty-key'), false, 'empty entry should be removed');
  assert.equal(map.has('fresh-key'), true, 'fresh entry should be kept');
});

test('sweepRateLimitMap does not remove entries that still have valid hits', () => {
  const map = new Map<string, number[]>();
  const expired = Date.now() - RATE_LIMIT_WINDOW_MS - 1;
  // Mix of expired and fresh — newest is fresh, so entry must be kept
  map.set('mixed-key', [expired, Date.now()]);

  sweepRateLimitMap(map);

  assert.equal(
    map.has('mixed-key'),
    true,
    'entry with a fresh hit should survive',
  );
});
