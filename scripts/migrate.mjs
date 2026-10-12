// Apply database migrations to the Postgres in DATABASE_URL. Run during deploy: `npm run db:migrate`.
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. (Local development uses the embedded database, which migrates itself.)');
  process.exit(1);
}
const pool = new pg.Pool({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === 'false' || url.includes('localhost') ? false : { rejectUnauthorized: false },
});
try {
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
} catch (err) {
  console.error('Migration failed:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
