import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import db from '../api/db';
import { isValidEmail } from '../api/email';

const insert = db.prepare('INSERT OR IGNORE INTO emails (email) VALUES (?)');

export async function importCSV(filePath: string): Promise<void> {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(resolved, { encoding: 'utf-8' }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let headerChecked = false;
  let imported = 0;
  let duplicates = 0;
  let invalid = 0;

  db.exec('BEGIN');

  try {
    for await (const raw of rl) {
      if (!headerChecked) {
        headerChecked = true;
        if (raw.trim().toLowerCase() !== 'email') {
          throw new Error(
            `Unexpected header "${raw.trim()}". Expected "email".`,
          );
        }
        continue;
      }

      const email = raw.trim().toLowerCase();
      if (email === '') continue;

      if (!isValidEmail(email)) {
        console.warn(`  Skipping invalid email: ${raw.trim()}`);
        invalid++;
        continue;
      }

      const result = insert.run(email) as { changes: number };
      if (result.changes === 0) {
        duplicates++;
      } else {
        imported++;
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.log(
    `Done. Imported: ${imported}, duplicates skipped: ${duplicates}, invalid skipped: ${invalid}`,
  );
}

if (require.main === module) {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: npm run import -- <path/to/file.csv>');
    process.exit(1);
  }

  importCSV(filePath).catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
}
