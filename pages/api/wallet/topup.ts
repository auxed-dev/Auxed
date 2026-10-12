import { eq } from 'drizzle-orm';
import { payments } from '@/lib/db/schema';
import { route, body, requireUser, num, rateLimit, appUrl, HttpError } from '@/lib/server/http';
import { newId } from '@/lib/server/crypto';
import { activeProvider, createCheckout } from '@/lib/server/payments';
import { settlePayment } from '@/lib/server/services/wallet';

/** Starts a wallet top-up. Returns a hosted checkout URL (or credits instantly with the dev provider). */
export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`topup:${user.id}`, 10, 10 * 60_000);
    const amountCents = Math.round(num(body(ctx).amount, 'Amount', { min: 20, max: 5000 }) * 100);
    const provider = activeProvider();
    if (!provider) throw new HttpError(503, 'Top-ups are not available yet. Please try again soon.', 'PAYMENTS_DISABLED');
    const id = newId();
    await ctx.db.insert(payments).values({ id, userId: user.id, provider, amountCents, status: 'PENDING' });
    const base = appUrl(ctx.req);
    const returnUrl = `${base}/api/wallet/return?paymentId=${id}`;
    if (provider === 'dev') {
      await settlePayment(ctx.db, id, amountCents, `dev_${id}`);
      return { credited: true, redirectUrl: '/profile?topup=success' };
    }
    const { redirectUrl, providerRef } = await createCheckout(provider, {
      paymentId: id,
      amountCents,
      email: user.email,
      returnUrl,
      cancelUrl: `${base}/profile?topup=cancelled`,
    });
    if (providerRef) await ctx.db.update(payments).set({ providerRef }).where(eq(payments.id, id));
    return { credited: false, redirectUrl };
  },
});
