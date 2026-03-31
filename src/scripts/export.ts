import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import db from '../api/db';

type EmailRow = {
  email: string;
};

const selectAll = db.prepare(
  'SELECT email FROM emails ORDER BY created_at ASC',
);

export async function exportCSV(filePath: string): Promise<void> {
  const resolved = path.resolve(filePath);
  let count = 0;

  // Build a Readable from the SQLite iterator so that pipeline() propagates
  // both read errors and write errors (e.g. disk full) to the returned promise.
  function* rowGenerator() {
    yield 'email\n';
    for (const row of selectAll.iterate() as IterableIterator<EmailRow>) {
      yield `${row.email}\n`;
      count++;
    }
  }

  const source = Readable.from(rowGenerator(), { encoding: 'utf-8' });
  const dest = fs.createWriteStream(resolved, { encoding: 'utf-8' });

  await pipeline(source, dest);

  console.log(`Exported ${count} email(s) to ${resolved}`);
}

if (require.main === module) {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: npm run export -- <path/to/output.csv>');
    process.exit(1);
  }

  exportCSV(filePath).catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
}
