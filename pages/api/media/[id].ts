import type { NextApiRequest, NextApiResponse } from 'next';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { media } from '@/lib/db/schema';

/** Serves an uploaded image. Ids are random and content never changes, so it caches forever. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const id = String(req.query.id ?? '');
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return res.status(404).end();
  const db = await getDb();
  const row = (await db.select().from(media).where(eq(media.id, id)).limit(1))[0];
  if (!row) return res.status(404).end();
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Content-Length', String(row.bytes));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.status(200).end(row.data);
}
