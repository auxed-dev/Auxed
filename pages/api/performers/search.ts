import { asc, ilike } from 'drizzle-orm';
import { performers } from '@/lib/db/schema';
import { route, query } from '@/lib/server/http';

export default route({
  async GET(ctx) {
    const q = (query(ctx, 'q') ?? '').trim().replace(/[%_]/g, '').slice(0, 60);
    const rows = await ctx.db
      .select({ id: performers.id, name: performers.name, imageUrl: performers.imageUrl, genres: performers.genres, type: performers.type })
      .from(performers)
      .where(q ? ilike(performers.name, `%${q}%`) : undefined)
      .orderBy(asc(performers.name))
      .limit(20);
    return { performers: rows };
  },
});
