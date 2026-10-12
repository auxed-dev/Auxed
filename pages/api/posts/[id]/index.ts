import { eq } from 'drizzle-orm';
import { performances, posts, venues } from '@/lib/db/schema';
import { route, requireUser, query, notFound, forbidden } from '@/lib/server/http';

/** Delete a post: its author, the venue owner (moderation) or an admin. */
export default route({
  async DELETE(ctx) {
    const user = requireUser(ctx);
    const post = (await ctx.db.select().from(posts).where(eq(posts.id, query(ctx, 'id')!)).limit(1))[0];
    if (!post) throw notFound();
    let allowed = post.authorId === user.id || user.role === 'ADMIN';
    if (!allowed && post.performanceId) {
      const v = await ctx.db
        .select({ ownerId: venues.ownerId })
        .from(performances)
        .innerJoin(venues, eq(venues.id, performances.venueId))
        .where(eq(performances.id, post.performanceId))
        .limit(1);
      allowed = v[0]?.ownerId === user.id;
    }
    if (!allowed) throw forbidden();
    await ctx.db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, post.id));
    return { ok: true };
  },
});
