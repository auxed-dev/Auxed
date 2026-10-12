import { and, desc, eq, sql } from 'drizzle-orm';
import { performances, requests, venues } from '@/lib/db/schema';
import { route, query } from '@/lib/server/http';
import { requirePerformer } from '@/lib/server/guards';

/** "The People's Trinkets": the songs the crowd asked for at one of your sets. */
export default route({
  async GET(ctx) {
    const { performer } = await requirePerformer(ctx);
    const sets = await ctx.db
      .select({ id: performances.id, title: performances.title, venue: venues.name, startsAt: performances.startsAt, endsAt: performances.endsAt, n: sql<number>`count(${requests.id})` })
      .from(performances)
      .innerJoin(venues, eq(venues.id, performances.venueId))
      .leftJoin(requests, and(eq(requests.performanceId, performances.id), eq(requests.kind, 'SONG')))
      .where(eq(performances.performerId, performer.id))
      .groupBy(performances.id, venues.name)
      .having(sql`count(${requests.id}) > 0`)
      .orderBy(desc(performances.startsAt))
      .limit(30);
    const selected = query(ctx, 'performanceId') ?? sets[0]?.id;
    const tracks = selected
      ? await ctx.db
          .select({
            title: sql<string>`${requests.track}->>'title'`,
            artist: sql<string>`${requests.track}->>'artist'`,
            album: sql<string>`max(${requests.track}->>'album')`,
            artwork: sql<string>`max(${requests.track}->>'artwork')`,
            n: sql<number>`count(*)`,
          })
          .from(requests)
          .where(and(eq(requests.performanceId, selected), eq(requests.kind, 'SONG'), sql`${requests.status} <> 'REJECTED'`))
          .groupBy(sql`1`, sql`2`)
          .orderBy(desc(sql`count(*)`))
          .limit(100)
      : [];
    return {
      sets: sets.map((s) => ({ id: s.id, title: s.title, venue: s.venue, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), requests: Number(s.n) })),
      selected: selected ?? null,
      tracks: tracks.map((t) => ({ ...t, count: Number(t.n) })),
    };
  },
});
