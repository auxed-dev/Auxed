import { eq, sql, and, gt, inArray } from 'drizzle-orm';
import { ledger, users } from '@/lib/db/schema';
import { route, body, requireUser, num } from '@/lib/server/http';

/** Night-out spending cap (per 12 hours). GET returns the cap and what's been spent. */
export default route({
  async GET(ctx) {
    const user = requireUser(ctx);
    const [{ spent }] = await ctx.db
      .select({ spent: sql<number>`coalesce(-sum(${ledger.amountCents}), 0)` })
      .from(ledger)
      .where(and(eq(ledger.userId, user.id), inArray(ledger.type, ['REQUEST', 'REFUND']), gt(ledger.createdAt, new Date(Date.now() - 12 * 3600_000))));
    return { capCents: user.spendCapCents, spentCents: Math.max(0, Number(spent)) };
  },
  async PUT(ctx) {
    const user = requireUser(ctx);
    const v = body(ctx).cap;
    const capCents = v === null || v === '' || v === undefined ? null : Math.round(num(v, 'Limit', { min: 10, max: 10000 }) * 100);
    await ctx.db.update(users).set({ spendCapCents: capCents }).where(eq(users.id, user.id));
    return { capCents };
  },
});
