import { desc, eq } from 'drizzle-orm';
import { performances, venues } from '@/lib/db/schema';
import { route, body, str, isoDate, bad, notFound } from '@/lib/server/http';
import { newId } from '@/lib/server/crypto';
import { requirePerformer } from '@/lib/server/guards';
import { perfStatus } from '@/lib/server/services/core';

export default route({
  /** All of the artist's sets with their set lists ("My Set Box"). */
  async GET(ctx) {
    const { performer } = await requirePerformer(ctx);
    const rows = await ctx.db
      .select({ p: performances, venue: venues.name })
      .from(performances)
      .innerJoin(venues, eq(venues.id, performances.venueId))
      .where(eq(performances.performerId, performer.id))
      .orderBy(desc(performances.startsAt))
      .limit(60);
    return {
      sets: rows.map(({ p, venue }) => ({
        id: p.id,
        title: p.title,
        venue,
        venueId: p.venueId,
        startsAt: p.startsAt.toISOString(),
        endsAt: p.endsAt.toISOString(),
        status: perfStatus(p),
        setlist: p.setlist,
      })),
    };
  },
  /** Create a set at a venue ("Add a new request set" / "Connect to venue"). */
  async POST(ctx) {
    const { user, performer } = await requirePerformer(ctx);
    const b = body(ctx);
    const venueId = str(b.venueId, 'Venue', { max: 40 });
    const venue = (await ctx.db.select().from(venues).where(eq(venues.id, venueId)).limit(1))[0];
    if (!venue) throw notFound('Venue not found.');
    const goLive = b.goLive === true;
    const startsAt = goLive ? new Date() : isoDate(b.startsAt, 'Start time');
    const endsAt = b.endsAt ? isoDate(b.endsAt, 'End time') : new Date(startsAt.getTime() + 3 * 3600_000);
    if (endsAt <= startsAt) throw bad('The set must end after it starts.');
    const id = newId();
    await ctx.db.insert(performances).values({
      id,
      performerId: performer.id,
      venueId,
      title: str(b.title, 'Title', { optional: true, max: 80 }) || venue.name,
      startsAt,
      endsAt,
      wentLiveAt: goLive ? new Date() : null,
      crowdEstimate: venue.liveCapacity || venue.capacity,
      imageUrl: venue.imageUrl,
      createdById: user.id,
    });
    return { id };
  },
});
