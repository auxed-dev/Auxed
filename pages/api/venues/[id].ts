import { eq } from 'drizzle-orm';
import { venues } from '@/lib/db/schema';
import { route, query, notFound } from '@/lib/server/http';
import { venueDTO } from '@/lib/server/services/core';
import { venueCurrentPerformance } from '@/lib/server/services/discovery';

/** Venue details plus the set to open (live now, else next, else most recent). */
export default route({
  async GET(ctx) {
    const v = (await ctx.db.select().from(venues).where(eq(venues.id, query(ctx, 'id')!)).limit(1))[0];
    if (!v) throw notFound('Venue not found.');
    return { venue: venueDTO(v), performanceId: await venueCurrentPerformance(ctx.db, v.id) };
  },
});
