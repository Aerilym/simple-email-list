import db from '../api/db';

type CountRow = {
  count: number;
};

const total = db.prepare('SELECT COUNT(*) AS count FROM emails');
const since = db.prepare(
  "SELECT COUNT(*) AS count FROM emails WHERE created_at >= datetime('now', ?)",
);

export function printSummary(): void {
  const totalCount = (total.get() as unknown as CountRow).count;
  const last7 = (since.get('-7 days') as unknown as CountRow).count;
  const last30 = (since.get('-30 days') as unknown as CountRow).count;

  console.log(`Total:        ${totalCount}`);
  console.log(`Last 7 days:  ${last7}`);
  console.log(`Last 30 days: ${last30}`);
}

if (require.main === module) {
  printSummary();
}
