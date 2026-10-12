import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb, sampleDataEnabled } from '@/lib/db';
import { setUpTestNight } from '@/lib/db/testNight';

/** Development only: put a DJ live at a venue with AUX IN on (POST { dj?, venueId? }). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV === 'production' || !sampleDataEnabled()) return res.status(404).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });
  const b = (req.body ?? {}) as { dj?: string; venueId?: string };
  res.status(200).json(await setUpTestNight(await getDb(), b.dj || 'JackBoy', b.venueId || 'v_carpet'));
}
