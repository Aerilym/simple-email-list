import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// This file must be run in its own process (which node --test does per file)
// so that the module cache is clean and DB_PATH takes effect before any import.
process.env.DB_PATH = ':memory:';

const { exportCSV } = require('../scripts/export') as {
  exportCSV: (filePath: string) => Promise<void>;
};

function tmpFile(): string {
  return path.join(os.tmpdir(), `export-empty-test-${Date.now()}.csv`);
}

test('exports only the header row when the database is empty', async () => {
  const out = tmpFile();
  await exportCSV(out);

  const content = fs.readFileSync(out, 'utf-8');
  assert.equal(content, 'email\n');
});
