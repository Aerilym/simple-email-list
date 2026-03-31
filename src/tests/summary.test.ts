import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DB_PATH = ':memory:';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { printSummary } = require('../scripts/summary') as {
  printSummary: () => void;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const db = require('../api/db').default as import('node:sqlite').DatabaseSync;

function insertEmail(email: string, daysAgo: number) {
  db.prepare(
    `INSERT INTO emails (email, created_at) VALUES (?, datetime('now', ?))`,
  ).run(email, `-${daysAgo} days`);
}

test('reports zero counts on empty database', (t) => {
  const lines: string[] = [];
  t.mock.method(console, 'log', (msg: string) => lines.push(msg));

  printSummary();

  assert.ok(lines.some((l) => l.includes('Total:') && l.includes('0')));
  assert.ok(lines.some((l) => l.includes('Last 7 days:') && l.includes('0')));
  assert.ok(lines.some((l) => l.includes('Last 30 days:') && l.includes('0')));
});

test('counts total emails correctly', (t) => {
  insertEmail('a@example.com', 0);
  insertEmail('b@example.com', 10);
  insertEmail('c@example.com', 40);

  const lines: string[] = [];
  t.mock.method(console, 'log', (msg: string) => lines.push(msg));

  printSummary();

  assert.ok(lines.some((l) => l.startsWith('Total:') && l.includes('3')));
});

test('counts last 7 days correctly', (t) => {
  const lines: string[] = [];
  t.mock.method(console, 'log', (msg: string) => lines.push(msg));

  printSummary();

  // Only the email inserted 0 days ago qualifies
  assert.ok(lines.some((l) => l.startsWith('Last 7 days:') && l.includes('1')));
});

test('counts last 30 days correctly', (t) => {
  const lines: string[] = [];
  t.mock.method(console, 'log', (msg: string) => lines.push(msg));

  printSummary();

  // Emails inserted 0 and 10 days ago qualify; 40 days ago does not
  assert.ok(
    lines.some((l) => l.startsWith('Last 30 days:') && l.includes('2')),
  );
});
