import type { NextApiRequest, NextApiResponse } from 'next';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { payments } from '@/lib/db/schema';
import { verifyReturn, type Provider } from '@/lib/server/payments';
import { failPayment, settlePayment } from '@/lib/server/services/wallet';

/** Where the payment provider sends the user back. Verifies with the provider (webhook is the primary path). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const paymentId = String(req.query.paymentId ?? '');
  try {
    const db = await getDb();
    const p = (await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1))[0];
    if (!p) return res.redirect(303, '/profile?topup=failed');
    if (p.status === 'PAID') return res.redirect(303, '/profile?topup=success');
    const params = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
    if (p.provider === 'paystack' && !params.reference) params.reference = p.id;
    const verified = await verifyReturn(p.provider as Provider, params);
    if (verified && verified.paymentId === p.id && verified.paid) {
      await settlePayment(db, p.id, verified.amountCents, verified.providerRef);
      return res.redirect(303, '/profile?topup=success');
    }
    if (verified && !verified.paid) await failPayment(db, p.id);
    return res.redirect(303, '/profile?topup=pending');
  } catch (err) {
    console.error('[wallet/return]', err);
    return res.redirect(303, '/profile?topup=pending');
  }
}
