import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH =
  process.env.DB_PATH ??
  (() => {
    // Use process.cwd() (the project root when run via pnpm scripts) rather
    // than __dirname so the path is not sensitive to the compiled output
    // directory structure.
    const DATA_DIR = path.join(process.cwd(), 'data');
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    return path.join(DATA_DIR, 'emails.db');
  })();

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA synchronous=NORMAL;
  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

export default db;
