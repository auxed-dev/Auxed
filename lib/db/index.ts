import fs from 'fs';
import path from 'path';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export { schema };

declare global {
  // eslint-disable-next-line no-var
  var __auxedDb: Promise<DB> | undefined;
  // eslint-disable-next-line no-var
  var __auxedMigrate: { run: () => Promise<void>; journalMtime: number } | undefined;
}

const MIGRATIONS = path.join(process.cwd(), 'drizzle');

/**
 * Production: set DATABASE_URL to any Postgres (Supabase, Neon, RDS...). Migrations run with
 * `npm run db:migrate` during deploy (or automatically when AUXED_AUTO_MIGRATE=true).
 * Local development: with no DATABASE_URL an embedded Postgres (PGlite) is stored in ./data/pglite.
 */
async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  let db: DB;
  if (url) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl: process.env.DATABASE_SSL === 'false' ? false : url.includes('localhost') ? false : { rejectUnauthorized: false },
    });
    db = drizzle(pool, { schema });
    if (process.env.AUXED_AUTO_MIGRATE === 'true') {
      const { migrate } = await import('drizzle-orm/node-postgres/migrator');
      await migrate(db, { migrationsFolder: MIGRATIONS });
    }
  } else {
    if (process.env.NODE_ENV === 'production' && process.env.AUXED_ALLOW_EMBEDDED_DB !== 'true') {
      throw new Error('DATABASE_URL is required in production.');
    }
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const dir = process.env.AUXED_PGLITE_DIR ?? path.join(process.cwd(), 'data', 'pglite');
    fs.mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    const pg = drizzle(client, { schema });
    await migrate(pg, { migrationsFolder: MIGRATIONS });
    // Development: apply migrations added while the server is running (no restart needed).
    globalThis.__auxedMigrate = { run: () => migrate(pg, { migrationsFolder: MIGRATIONS }), journalMtime: journalMtime() };
    db = pg as unknown as DB;
  }
  if (sampleDataEnabled()) {
    const { seedIfEmpty } = await import('./seed');
    await seedIfEmpty(db);
  }
  return db;
}

/** Sample content (and the simulated crowd) is on in development, or when AUXED_SAMPLE_DATA=true. */
export function sampleDataEnabled(): boolean {
  if (process.env.AUXED_SAMPLE_DATA) return process.env.AUXED_SAMPLE_DATA === 'true';
  return process.env.NODE_ENV !== 'production';
}

const journalMtime = () => {
  try {
    return fs.statSync(path.join(MIGRATIONS, 'meta', '_journal.json')).mtimeMs;
  } catch {
    return 0;
  }
};

export function getDb(): Promise<DB> {
  const m = globalThis.__auxedMigrate;
  if (globalThis.__auxedDb && m && process.env.NODE_ENV !== 'production') {
    const mtime = journalMtime();
    if (mtime !== m.journalMtime) {
      m.journalMtime = mtime;
      const ready = globalThis.__auxedDb;
      globalThis.__auxedDb = ready.then(async (db) => {
        await m.run();
        return db;
      });
    }
  }
  if (!globalThis.__auxedDb) {
    globalThis.__auxedDb = connect().catch((err) => {
      globalThis.__auxedDb = undefined;
      throw err;
    });
  }
  return globalThis.__auxedDb;
}
