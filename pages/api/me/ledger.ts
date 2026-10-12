import { desc, eq } from 'drizzle-orm';
import { ledger } from '@/lib/db/schema';
import { route, requireUser } from '@/lib/server/http';
import { activeProvider } from '@/lib/server/payments';

export default route({
  async GET(ctx) {
    const user = requireUser(ctx);
    const rows = await ctx.db.select().from(ledger).where(eq(ledger.userId, user.id)).orderBy(desc(ledger.createdAt)).limit(50);
    return {
      walletCents: user.walletCents,
      provider: activeProvider(),
      entries: rows.map((r) => ({ id: r.id, type: r.type, amountCents: r.amountCents, note: r.note, createdAt: r.createdAt.toISOString() })),
    };
  },
});
