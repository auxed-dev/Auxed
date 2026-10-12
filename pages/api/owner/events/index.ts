import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { events, stages, venues } from '@/lib/db/schema';
import { route, body, str, oneOf, isoDate, safeUrl, num, bad, notFound } from '@/lib/server/http';
import { newId } from '@/lib/server/crypto';
import { requireOwner } from '@/lib/server/guards';

/** Your events (GET) and posting a new festival or club night with its stages (POST). */
export default route({
  /** Your events with their stages (for booking artists onto a stage). */
  async GET(ctx) {
    const user = requireOwner(ctx);
    const rows = await ctx.db.select().from(events).where(eq(events.ownerId, user.id)).orderBy(desc(events.startsAt)).limit(50);
    const ids = rows.map((e) => e.id);
    const stageRows = ids.length ? await ctx.db.select().from(stages).where(inArray(stages.eventId, ids)).orderBy(asc(stages.sort)) : [];
    return {
      events: rows.map((e) => ({
        id: e.id,
        title: e.title,
        venueId: e.venueId,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        stages: stageRows.filter((s) => s.eventId === e.id).map((s) => ({ id: s.id, name: s.name })),
      })),
    };
  },
  async POST(ctx) {
    const user = requireOwner(ctx);
    const b = body(ctx);
    const venueId = b.venueId ? str(b.venueId, 'Venue', { max: 40 }) : null;
    const venue = venueId ? (await ctx.db.select().from(venues).where(and(eq(venues.id, venueId), eq(venues.ownerId, user.id))).limit(1))[0] : null;
    if (venueId && !venue) throw notFound('Venue not found.');
    const startsAt = isoDate(b.startsAt, 'Start');
    const endsAt = isoDate(b.endsAt, 'End');
    if (endsAt <= startsAt) throw bad('The event must end after it starts.');
    const title = str(b.title, 'Event name', { min: 2, max: 80 });
    const clash = await ctx.db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.title, title), eq(events.startsAt, startsAt)))
      .limit(1);
    if (clash[0]) throw bad('This event is already posted.');
    const stageNames: string[] = Array.isArray(b.stages) ? b.stages.map((s) => String(s).trim().toUpperCase().slice(0, 40)).filter(Boolean).slice(0, 12) : [];
    const id = newId();
    const imageUrl = safeUrl(b.imageUrl, 'Poster') ?? venue?.imageUrl ?? null;
    await ctx.db.transaction(async (tx) => {
      await tx.insert(events).values({
        id,
        ownerId: user.id,
        venueId,
        title,
        category: oneOf(b.category ?? 'FESTIE', 'Category', ['FESTIE', 'CLUB'] as const),
        location: str(b.location, 'Location', { optional: true, max: 120 }) || (venue ? `${venue.name}, ${venue.city}` : 'TBA'),
        subtitle: str(b.subtitle, 'Subtitle', { optional: true, max: 120 }) || venue?.name || '',
        imageUrl,
        heroColor: /^#[0-9A-Fa-f]{6}$/.test(String(b.heroColor ?? '')) ? String(b.heroColor) : '#0B1A6B',
        description: str(b.description, 'Description', { optional: true, max: 1000 }),
        startsAt,
        endsAt,
        lat: b.lat !== undefined ? num(b.lat, 'Latitude', { min: -90, max: 90 }) : venue?.lat ?? 0,
        lng: b.lng !== undefined ? num(b.lng, 'Longitude', { min: -180, max: 180 }) : venue?.lng ?? 0,
      });
      const names = stageNames.length ? stageNames : ['MAIN STAGE'];
      await tx.insert(stages).values(names.map((name, i) => ({ id: newId(), eventId: id, name, imageUrl, sort: i })));
    });
    return { id };
  },
});
