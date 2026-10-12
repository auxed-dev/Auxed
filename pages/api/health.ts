import type { NextApiRequest, NextApiResponse } from 'next';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

/** Liveness + database check for uptime monitors and load balancers. */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[health]', err);
    res.status(503).json({ ok: false });
  }
}
