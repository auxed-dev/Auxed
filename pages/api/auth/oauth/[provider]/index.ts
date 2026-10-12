import type { NextApiRequest, NextApiResponse } from 'next';
import { providerEnabled, startOAuth, type OAuthProvider } from '@/lib/server/oauth';

/** GET /api/auth/oauth/google?role=USER — redirects to the provider. */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const provider = req.query.provider as OAuthProvider;
  if (provider !== 'google' && provider !== 'apple') return res.status(404).end();
  const role = (['USER', 'PERFORMER', 'OWNER'] as const).find((r) => r === req.query.role) ?? 'USER';
  if (!providerEnabled(provider)) {
    return res.redirect(302, `/join?role=${role}&error=${encodeURIComponent(`${provider === 'google' ? 'Google' : 'Apple'} sign-in isn't set up yet. Use email for now.`)}`);
  }
  res.redirect(302, startOAuth(req, res, provider, role));
}
