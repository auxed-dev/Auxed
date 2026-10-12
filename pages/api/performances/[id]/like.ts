import { and, eq } from 'drizzle-orm';
import { performanceLikes, performances } from '@/lib/db/schema';
import { route, requireUser, query, notFound } from '@/lib/server/http';

export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    const id = query(ctx, 'id')!;
    const perf = await ctx.db.select({ id: performances.id }).from(performances).where(eq(performances.id, id)).limit(1);
    if (!perf[0]) throw notFound();
    const where = and(eq(performanceLikes.performanceId, id), eq(performanceLikes.userId, user.id));
    const mine = await ctx.db.select().from(performanceLikes).where(where).limit(1);
    if (mine[0]) {
      await ctx.db.delete(performanceLikes).where(where);
      return { liked: false };
    }
    await ctx.db.insert(performanceLikes).values({ performanceId: id, userId: user.id });
    return { liked: true };
  },
});
