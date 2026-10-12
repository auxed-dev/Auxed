import { and, eq } from 'drizzle-orm';
import { postLikes, posts } from '@/lib/db/schema';
import { route, requireUser, query, notFound } from '@/lib/server/http';

export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    const id = query(ctx, 'id')!;
    const p = await ctx.db.select({ id: posts.id }).from(posts).where(eq(posts.id, id)).limit(1);
    if (!p[0]) throw notFound();
    const where = and(eq(postLikes.postId, id), eq(postLikes.userId, user.id));
    const mine = await ctx.db.select().from(postLikes).where(where).limit(1);
    if (mine[0]) {
      await ctx.db.delete(postLikes).where(where);
      return { liked: false };
    }
    await ctx.db.insert(postLikes).values({ postId: id, userId: user.id });
    return { liked: true };
  },
});
