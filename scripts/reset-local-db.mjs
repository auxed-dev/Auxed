// Delete the embedded development database (./data/pglite). It is recreated and re-seeded on the next request.
import { rmSync } from 'node:fs';
import path from 'node:path';

if (process.env.DATABASE_URL) {
  console.error('DATABASE_URL is set — refusing to touch a real database. This only resets the local embedded one.');
  process.exit(1);
}
const dir = process.env.AUXED_PGLITE_DIR ?? path.join(process.cwd(), 'data', 'pglite');
rmSync(dir, { recursive: true, force: true });
console.log(`Removed ${dir}. Stop the dev server first if it was running, then start it again to re-seed.`);
