import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/server/session';
import { finishSpotifyConnect } from '@/lib/server/musicConnect';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await getDb();
  const user = await getSessionUser(db, req, res);
  if (!user) return res.redirect(302, '/login');
  try {
    res.redirect(302, await finishSpotifyConnect(db, req, res, user.id));
  } catch (err) {
    console.error('[spotify] connect', err);
    res.redirect(302, '/profile?music=failed');
  }
}
