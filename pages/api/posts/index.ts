import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { posts } from '@/lib/db/schema';
import { requireRoomAccess } from '@/lib/server/services/rooms';
import { route, body, requireUser, query, str, oneOf, safeUrl, rateLimit, bad } from '@/lib/server/http';
import { postDTOs } from '@/lib/server/services/core';
import { createPost } from '@/lib/server/services/rooms';

export default route({
  /** Wire Room feed. ?performanceId= for a set's section chat; ?before=ISO for pagination. */
  async GET(ctx) {
    const performanceId = query(ctx, 'performanceId') ?? null;
    if (performanceId) await requireRoomAccess(ctx.db, performanceId, ctx.user);
    const before = query(ctx, 'before');
    const kind = query(ctx, 'kind');
    const where = and(
      performanceId ? eq(posts.performanceId, performanceId) : sql`${posts.performanceId} is null`,
      sql`${posts.deletedAt} is null`,
      before ? lt(posts.createdAt, new Date(before)) : undefined,
      kind === 'MANAGEMENT' ? eq(posts.kind, 'MANAGEMENT') : undefined,
    );
    const rows = await ctx.db.select().from(posts).where(where).orderBy(desc(posts.createdAt)).limit(40);
    return { posts: await postDTOs(ctx.db, rows, ctx.user?.id ?? null) };
  },
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`post:${user.id}`, 30, 60_000);
    const b = body(ctx);
    const kind = oneOf(b.kind ?? 'CHAT', 'Kind', ['CHAT', 'MIC', 'SNIPPET', 'MANAGEMENT'] as const);
    const text = str(b.text, 'Message', { optional: kind === 'SNIPPET', max: 500 });
    const imageUrl = safeUrl(b.imageUrl, 'Image');
    if (kind === 'SNIPPET' && !imageUrl && !text) throw bad('Add a photo or a few words.');
    const performanceId = b.performanceId ? str(b.performanceId, 'Set', { max: 40 }) : null;
    const toUserId = b.toUserId ? str(b.toUserId, 'Recipient', { max: 40 }) : null;
    return createPost(ctx.db, user, {
      kind,
      performanceId,
      text,
      caption: b.caption ? str(b.caption, 'Caption', { max: 300 }) : null,
      imageUrl,
      toUserId,
      label: b.label ? str(b.label, 'Label', { max: 60 }) : null,
    });
  },
});
