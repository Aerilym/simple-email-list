import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { before, test } from 'node:test';

process.env.DB_PATH = ':memory:';

const { exportCSV } = require('../scripts/export') as {
  exportCSV: (filePath: string) => Promise<void>;
};

const { importCSV } = require('../scripts/import') as {
  importCSV: (filePath: string) => Promise<void>;
};

function tmpFile(): string {
  return path.join(os.tmpdir(), `export-test-${Date.now()}.csv`);
}

function writeCsv(lines: string[]): string {
  const file = tmpFile();
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

before(async () => {
  // Seed the in-memory DB via importCSV so export has something to work with
  const seed = writeCsv([
    'email',
    'alpha@example.com',
    'beta@example.com',
    'gamma@example.com',
  ]);
  await importCSV(seed);
});

test('exports a header row and all emails', async () => {
  const out = tmpFile();
  await exportCSV(out);

  const lines = fs.readFileSync(out, 'utf-8').split('\n').filter(Boolean);
  assert.equal(lines[0], 'email');
  assert.equal(lines.length, 4); // header + 3 emails
});

test('exported emails match what was imported', async () => {
  const out = tmpFile();
  await exportCSV(out);

  const lines = fs.readFileSync(out, 'utf-8').split('\n').filter(Boolean);
  const emails = lines.slice(1);
  assert.ok(emails.includes('alpha@example.com'));
  assert.ok(emails.includes('beta@example.com'));
  assert.ok(emails.includes('gamma@example.com'));
});

test('exported file is valid input for importCSV (round-trip)', async () => {
  const out = tmpFile();
  await exportCSV(out);

  // Re-importing should produce 0 new rows (all duplicates) and not throw
  const messages: string[] = [];
  const original = console.log;
  console.log = (msg: string) => messages.push(msg);
  try {
    await importCSV(out);
  } finally {
    console.log = original;
  }

  assert.ok(messages.some((m) => m.includes('Imported: 0')));
  assert.ok(messages.some((m) => m.includes('duplicates skipped: 3')));
});

test('exported file uses trailing newline format', async () => {
  const out = tmpFile();
  await exportCSV(out);
  const content = fs.readFileSync(out, 'utf-8');
  // Every line including the last should end with \n
  assert.ok(content.endsWith('\n'));
});
