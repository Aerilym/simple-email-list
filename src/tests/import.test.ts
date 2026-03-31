import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// Use in-memory DB for tests — must be set before importing import.ts/db
process.env.DB_PATH = ':memory:';

const { importCSV } = require('../scripts/import') as {
  importCSV: (f: string) => Promise<void>;
};

function writeCsv(lines: string[]): string {
  const file = path.join(os.tmpdir(), `test-${Date.now()}.csv`);
  fs.writeFileSync(file, lines.join('\n'));
  return file;
}

test('imports valid emails from CSV', async (t) => {
  const file = writeCsv(['email', 'a@example.com', 'b@example.com']);
  const messages: string[] = [];
  t.mock.method(console, 'log', (msg: string) => messages.push(msg));

  await importCSV(file);

  assert.ok(messages.some((m) => m.includes('Imported: 2')));
  assert.ok(messages.some((m) => m.includes('duplicates skipped: 0')));
  assert.ok(messages.some((m) => m.includes('invalid skipped: 0')));
});

test('skips duplicate emails', async (t) => {
  const file = writeCsv(['email', 'dup@example.com', 'dup@example.com']);
  const messages: string[] = [];
  t.mock.method(console, 'log', (msg: string) => messages.push(msg));

  await importCSV(file);

  assert.ok(
    messages.some(
      (m) => /Imported: \d+/.test(m) && m.includes('duplicates skipped: 1'),
    ),
  );
});

test('skips invalid emails and logs a warning', async (t) => {
  const file = writeCsv(['email', 'good@example.com', 'bad-email']);
  const messages: string[] = [];
  const warnings: string[] = [];
  t.mock.method(console, 'log', (msg: string) => messages.push(msg));
  t.mock.method(console, 'warn', (msg: string) => warnings.push(msg));

  await importCSV(file);

  assert.ok(warnings.some((w) => w.includes('bad-email')));
  assert.ok(messages.some((m) => m.includes('invalid skipped: 1')));
});

test('skips empty lines', async (t) => {
  const file = writeCsv(['email', 'c@example.com', '', 'd@example.com']);
  const messages: string[] = [];
  t.mock.method(console, 'log', (msg: string) => messages.push(msg));

  await importCSV(file);

  assert.ok(messages.some((m) => m.includes('Imported: 2')));
});

test('normalises emails to lowercase on import', async (t) => {
  const file = writeCsv(['email', 'CAPS@EXAMPLE.COM']);
  const messages: string[] = [];
  t.mock.method(console, 'log', (msg: string) => messages.push(msg));

  await importCSV(file);

  assert.ok(messages.some((m) => m.includes('Imported: 1')));
});

test('throws when file does not exist', async () => {
  await assert.rejects(
    () => importCSV('/nonexistent/path/file.csv'),
    /File not found/,
  );
});

test('throws when CSV has wrong header', async () => {
  const file = writeCsv(['wrong_header', 'a@example.com']);
  await assert.rejects(() => importCSV(file), /Unexpected header/);
});
