import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/server/session';
import { spotifyEnabled, startSpotifyConnect } from '@/lib/server/musicConnect';

/** GET /api/music/connect/spotify?return=/profile — sends you to Spotify to link your account. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await getDb();
  const user = await getSessionUser(db, req, res);
  const back = typeof req.query.return === 'string' && req.query.return.startsWith('/') && !req.query.return.startsWith('//') ? req.query.return : '/profile';
  if (!user) return res.redirect(302, `/login?next=${encodeURIComponent(back)}`);
  if (!spotifyEnabled()) return res.redirect(302, `${back}?music=spotify-not-configured`);
  res.redirect(302, startSpotifyConnect(req, res, back));
}
