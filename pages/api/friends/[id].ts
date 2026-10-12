import { and, eq, or } from 'drizzle-orm';
import { friendships } from '@/lib/db/schema';
import { route, requireUser, query, notFound } from '@/lib/server/http';

export default route({
  /** Accept an incoming friend request. */
  async POST(ctx) {
    const user = requireUser(ctx);
    const other = query(ctx, 'id')!;
    const rows = await ctx.db
      .update(friendships)
      .set({ status: 'ACCEPTED' })
      .where(and(eq(friendships.requesterId, other), eq(friendships.addresseeId, user.id)))
      .returning();
    if (!rows.length) throw notFound('No pending request from that AUXee.');
    return { status: 'ACCEPTED' };
  },
  /** Remove a friend, or cancel/decline a request. */
  async DELETE(ctx) {
    const user = requireUser(ctx);
    const other = query(ctx, 'id')!;
    await ctx.db
      .delete(friendships)
      .where(
        or(
          and(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, other)),
          and(eq(friendships.requesterId, other), eq(friendships.addresseeId, user.id)),
        ),
      );
    return { ok: true };
  },
});
