import type { NextApiRequest, NextApiResponse } from 'next';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { clearOAuthCookie, finishOAuth, upsertOAuthUser, type OAuthProvider } from '@/lib/server/oauth';
import { createSession } from '@/lib/server/session';
import { homeFor } from '@/lib/server/accounts';

/** Provider callback (GET for Google, form POST for Apple). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const provider = req.query.provider as OAuthProvider;
  if (provider !== 'google' && provider !== 'apple') return res.status(404).end();
  try {
    const db = await getDb();
    const { identity, role } = await finishOAuth(req, provider);
    const userId = await upsertOAuthUser(db, provider, identity, role);
    const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    clearOAuthCookie(res);
    await createSession(db, userId, req, res);
    res.redirect(303, homeFor(user.role));
  } catch (err) {
    console.error(`[oauth:${provider}]`, err);
    clearOAuthCookie(res);
    res.redirect(303, `/join?error=${encodeURIComponent('Sign-in did not complete. Please try again.')}`);
  }
}
