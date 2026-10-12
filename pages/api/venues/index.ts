import { asc, ilike, or } from 'drizzle-orm';
import { venues } from '@/lib/db/schema';
import { route, query } from '@/lib/server/http';
import { venueDTO } from '@/lib/server/services/core';

/** Venue directory (used when an artist picks where to play). */
export default route({
  async GET(ctx) {
    const q = (query(ctx, 'q') ?? '').trim().replace(/[%_]/g, '').slice(0, 60);
    const rows = q
      ? await ctx.db.select().from(venues).where(or(ilike(venues.name, `%${q}%`), ilike(venues.city, `%${q}%`))).orderBy(asc(venues.name)).limit(30)
      : await ctx.db.select().from(venues).orderBy(asc(venues.name)).limit(60);
    return { venues: rows.map(venueDTO) };
  },
});
