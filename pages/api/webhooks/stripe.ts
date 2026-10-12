import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '@/lib/db';
import { readRawBody, verifyWebhook } from '@/lib/server/payments';
import { settlePayment } from '@/lib/server/services/wallet';

export const config = { api: { bodyParser: false } };

/** Stripe webhook (checkout.session.completed). Verified with STRIPE_WEBHOOK_SECRET. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const raw = await readRawBody(req);
  let evt;
  try {
    evt = verifyWebhook('stripe', raw, req.headers);
  } catch (err) {
    console.warn('[webhook:stripe] rejected', (err as Error).message);
    return res.status(400).end();
  }
  if (evt?.paid) await settlePayment(await getDb(), evt.paymentId, evt.amountCents, evt.providerRef);
  res.status(200).json({ received: true });
}
