import type { NextApiRequest, NextApiResponse } from 'next';
import { desc } from 'drizzle-orm';
import { getDb, sampleDataEnabled } from '@/lib/db';
import { users } from '@/lib/db/schema';

/** Development only: list accounts (no secrets). Disabled in production. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV === 'production' || !sampleDataEnabled()) return res.status(404).end();
  const db = await getDb();
  const rows = await db
    .select({ id: users.id, userName: users.userName, email: users.email, role: users.role, walletCents: users.walletCents, createdAt: users.createdAt })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(200);
  res.status(200).json({ users: rows });
}
