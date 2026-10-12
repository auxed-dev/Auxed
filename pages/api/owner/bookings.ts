import { and, eq } from 'drizzle-orm';
import { events, performances, performers, stages, venues } from '@/lib/db/schema';
import { route, body, str, oneOf, isoDate, num, bad, notFound } from '@/lib/server/http';
import { newId } from '@/lib/server/crypto';
import { requireOwner } from '@/lib/server/guards';

/** Book an artist for a slot at one of your venues (optionally on an event stage). */
export default route({
  async POST(ctx) {
    const user = requireOwner(ctx);
    const b = body(ctx);
    const venueId = str(b.venueId, 'Venue', { max: 40 });
    const venue = (await ctx.db.select().from(venues).where(and(eq(venues.id, venueId), eq(venues.ownerId, user.id))).limit(1))[0];
    if (!venue) throw notFound('Venue not found.');
    const performer = (await ctx.db.select().from(performers).where(eq(performers.id, str(b.performerId, 'Artist', { max: 40 }))).limit(1))[0];
    if (!performer) throw notFound('Artist not found.');
    let eventId: string | null = null;
    let stageId: string | null = null;
    if (b.stageId) {
      const st = (await ctx.db.select({ s: stages, ownerId: events.ownerId, eventId: events.id }).from(stages).innerJoin(events, eq(events.id, stages.eventId)).where(eq(stages.id, String(b.stageId))).limit(1))[0];
      if (!st || st.ownerId !== user.id) throw notFound('Stage not found.');
      eventId = st.eventId;
      stageId = st.s.id;
    }
    const startsAt = isoDate(b.startsAt, 'Start');
    const endsAt = isoDate(b.endsAt, 'End');
    if (endsAt <= startsAt) throw bad('The slot must end after it starts.');
    const id = newId();
    await ctx.db.insert(performances).values({
      id,
      performerId: performer.id,
      venueId,
      eventId,
      stageId,
      title: str(b.title, 'Title', { optional: true, max: 80 }) || performer.name,
      startsAt,
      endsAt,
      basis: oneOf(b.basis ?? 'Once off', 'Performance basis', ['Recurring', 'Once off'] as const),
      crowdEstimate: b.crowdEstimate !== undefined ? num(b.crowdEstimate, 'Crowd estimate', { min: 0, max: 500000, int: true }) : venue.capacity,
      imageUrl: performer.imageUrl ?? venue.imageUrl,
      createdById: user.id,
    });
    return { id };
  },
});
