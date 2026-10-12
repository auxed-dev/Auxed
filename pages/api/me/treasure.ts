import { and, desc, eq, or, sql } from 'drizzle-orm';
import { posts, requests } from '@/lib/db/schema';
import { route, requireUser } from '@/lib/server/http';
import { postDTOs, requestDTOs } from '@/lib/server/services/core';
import { listFavorites } from '@/lib/server/services/favorites';
import { ensureSampleSocial } from '@/lib/db/sampleSocial';

/** "My Treasure Box": your On The Mic moments, snippets and messages addressed to you. */
export default route({
  async GET(ctx) {
    const user = requireUser(ctx);
    const micRows = await ctx.db
      .select()
      .from(requests)
      .where(and(eq(requests.userId, user.id), eq(requests.kind, 'MIC')))
      .orderBy(desc(requests.createdAt))
      .limit(30);
    const postRows = await ctx.db
      .select()
      .from(posts)
      .where(
        and(
          sql`${posts.deletedAt} is null`,
          or(and(eq(posts.authorId, user.id), sql`${posts.kind} in ('MIC','SNIPPET')`), eq(posts.toUserId, user.id)),
        ),
      )
      .orderBy(desc(posts.createdAt))
      .limit(50);
    await ensureSampleSocial(ctx.db);
    const fav = await listFavorites(ctx.db, user.id);
    return {
      mics: await requestDTOs(ctx.db, micRows, user.id),
      posts: await postDTOs(ctx.db, postRows, user.id),
      favorites: fav.items,
      likedSets: fav.likedSets,
    };
  },
});
