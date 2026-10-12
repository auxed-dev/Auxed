import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { DB } from '../../db';
import { events, friendships, performances, performers, posts, requests, requestVotes, users, venues } from '../../db/schema';
import type { FriendDTO, PerformanceBrief, TicketDTO } from '../../types';
import { eventDTO, liveWhere, perfStatus, performanceBriefs, postDTOs, userBrief, venueDTO } from './core';

export async function homeFeed(db: DB, viewerId: string | null) {
  const festRows = await db
    .select()
    .from(events)
    .where(and(eq(events.category, 'FESTIE'), sql`${events.endsAt} > now()`))
    .orderBy(asc(events.startsAt))
    .limit(8);
  const festies = await Promise.all(festRows.map((e) => eventDTO(db, e, viewerId)));
  const clubPerfs = await performanceBriefs(db, and(liveWhere(), inArray(venues.kind, ['CLUB', 'LOUNGE'])), viewerId, { limit: 12 });
  const seen = new Set<string>();
  const clubs = clubPerfs.filter((p) => (seen.has(p.venue.id) ? false : (seen.add(p.venue.id), true)));
  const tickets = viewerId ? await userTickets(db, viewerId) : [];
  return { festies, clubs, tickets };
}

/** One "request ticket" per set the user requested into, newest first. */
export async function userTickets(db: DB, userId: string): Promise<TicketDTO[]> {
  const rows = await db
    .select({ r: requests, p: performances, pf: performers, v: venues })
    .from(requests)
    .innerJoin(performances, eq(performances.id, requests.performanceId))
    .innerJoin(performers, eq(performers.id, performances.performerId))
    .innerJoin(venues, eq(venues.id, performances.venueId))
    .where(and(eq(requests.userId, userId), sql`${requests.status} <> 'REJECTED'`))
    .orderBy(desc(requests.createdAt))
    .limit(60);
  const votes = await db
    .select({ performanceId: requests.performanceId, n: sql<number>`count(*)` })
    .from(requestVotes)
    .innerJoin(requests, eq(requests.id, requestVotes.requestId))
    .where(and(eq(requestVotes.userId, userId), eq(requestVotes.value, 1)))
    .groupBy(requests.performanceId);
  const voteMap = new Map(votes.map((v) => [v.performanceId, Number(v.n)]));
  const byPerf = new Map<string, TicketDTO>();
  for (const { r, p, pf, v } of rows) {
    const when = (r.playedAt ?? r.createdAt).toISOString();
    const t = byPerf.get(p.id);
    const song = r.kind === 'MIC' ? `On The Mic: "${(r.message ?? '').slice(0, 30)}"` : r.track?.title ?? 'Song';
    if (!t) {
      const st = perfStatus(p);
      byPerf.set(p.id, {
        performanceId: p.id,
        performerName: pf.name,
        venueName: v.name,
        imageUrl: p.imageUrl ?? v.imageUrl,
        from: when,
        to: new Date(new Date(when).getTime() + (r.track?.durationSec ?? 30) * 1000).toISOString(),
        songs: [song],
        requests: 1,
        upvotes: voteMap.get(p.id) ?? 0,
        status: st === 'LIVE' ? (r.status === 'PLAYED' ? 'PLAYED' : 'LIVE') : st === 'UPCOMING' ? 'UPCOMING' : 'PLAYED',
      });
    } else {
      t.songs.push(song);
      t.requests += 1;
      if (when < t.from) t.from = when;
    }
  }
  return Array.from(byPerf.values());
}

export async function vibes(db: DB, viewerId: string | null) {
  const live = await performanceBriefs(db, liveWhere(), viewerId, { limit: 20 });
  const recent = await performanceBriefs(
    db,
    sql`${performances.endedAt} is not null and ${performances.endedAt} > now() - interval '7 days'`,
    viewerId,
    { orderBy: 'startsDesc', limit: 10 },
  );
  const recentIds = recent.map((r) => r.id);
  const reactions = recentIds.length
    ? await db
        .select()
        .from(posts)
        .where(and(inArray(posts.performanceId, recentIds), sql`${posts.deletedAt} is null`))
        .orderBy(asc(posts.createdAt))
    : [];
  const reactionDTOs = await postDTOs(db, reactions, viewerId);
  const featured = await performanceBriefs(db, sql`${performances.caption} is not null`, viewerId, { orderBy: 'likes', limit: 10 });
  const label = (p: PerformanceBrief) => (/(Residents|Selector|Crew|Lounge)$/.test(p.performer.name) ? p.venue.name : p.performer.name);
  return {
    snippets: live.map((p) => ({ performance: p, label: label(p) })),
    recent: recent.map((p) => ({ performance: p, topReactions: reactionDTOs.filter((r) => r.performanceId === p.id).slice(0, 2) })),
    featured,
  };
}

export async function friendsOf(db: DB, userId: string): Promise<FriendDTO[]> {
  const rows = await db
    .select()
    .from(friendships)
    .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)));
  const otherIds = rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
  if (!otherIds.length) return [];
  const others = await db.select().from(users).where(inArray(users.id, otherIds));
  const byId = new Map(others.map((u) => [u.id, u]));
  return rows
    .map((r) => {
      const otherId = r.requesterId === userId ? r.addresseeId : r.requesterId;
      const u = byId.get(otherId);
      if (!u) return null;
      const status: FriendDTO['status'] = r.status === 'ACCEPTED' ? 'ACCEPTED' : r.requesterId === userId ? 'OUTGOING' : 'INCOMING';
      const share = status === 'ACCEPTED' && u.shareLocation;
      return { ...userBrief(u), status, lat: share ? u.lat : null, lng: share ? u.lng : null, statusText: share ? u.statusText : null };
    })
    .filter(Boolean) as FriendDTO[];
}

export async function mapData(db: DB, viewerId: string | null) {
  const venueRows = await db.select().from(venues);
  const liveBriefs = await performanceBriefs(db, liveWhere(), viewerId);
  const evRows = await db.select().from(events).where(sql`${events.endsAt} > now() - interval '1 day'`);
  const friends = viewerId ? (await friendsOf(db, viewerId)).filter((f) => f.lat !== null && f.lng !== null) : [];
  return {
    venues: venueRows.map((v) => {
      const lives = liveBriefs.filter((b) => b.venue.id === v.id);
      return {
        ...venueDTO(v),
        heat: v.capacity ? Math.min(1, v.liveCapacity / v.capacity) : 0,
        live: lives.map((b) => ({ id: b.id, title: b.title, performer: b.performer.name, nowPlaying: b.nowPlaying?.track.title ?? null })),
      };
    }),
    events: evRows.map((e) => ({ id: e.id, title: e.title, lat: e.lat, lng: e.lng, imageUrl: e.imageUrl, startsAt: e.startsAt.toISOString(), venueId: e.venueId })),
    friends,
  };
}

export async function search(db: DB, q: string, viewerId: string | null) {
  const term = `%${q.replace(/[%_]/g, '')}%`;
  const [venueRows, eventRows, performerRows] = await Promise.all([
    db.select().from(venues).where(or(ilike(venues.name, term), ilike(venues.city, term))).limit(8),
    db.select().from(events).where(or(ilike(events.title, term), ilike(events.location, term))).limit(8),
    db.select().from(performers).where(ilike(performers.name, term)).limit(8),
  ]);
  const perfIds = performerRows.map((p) => p.id);
  const sets = perfIds.length
    ? await performanceBriefs(db, and(inArray(performances.performerId, perfIds), sql`${performances.endedAt} is null`), viewerId, { limit: 12 })
    : [];
  return {
    venues: venueRows.map(venueDTO),
    events: eventRows.map((e) => ({ id: e.id, title: e.title, location: e.location, imageUrl: e.imageUrl, startsAt: e.startsAt.toISOString() })),
    performers: performerRows.map((p) => ({
      id: p.id,
      name: p.name,
      imageUrl: p.imageUrl,
      genres: p.genres,
      set: sets.find((s) => s.performer.id === p.id && s.status === 'LIVE') ?? sets.find((s) => s.performer.id === p.id) ?? null,
    })),
  };
}

/** The set to open for a venue: live now, otherwise the next one, otherwise the latest. */
export async function venueCurrentPerformance(db: DB, venueId: string) {
  const rows = await db.select().from(performances).where(eq(performances.venueId, venueId)).orderBy(desc(performances.startsAt));
  const live = rows.find((p) => perfStatus(p) === 'LIVE');
  if (live) return live.id;
  const upcoming = rows.filter((p) => perfStatus(p) === 'UPCOMING').sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  return upcoming?.id ?? rows[0]?.id ?? null;
}

function metres(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** The venue (with a live set) the phone is at, if any. Festival grounds get a bigger radius. */
export async function venueHere(db: DB, lat: number, lng: number, viewerId: string | null) {
  const venueRows = await db.select().from(venues);
  const near = venueRows
    .map((v) => ({ v, d: metres(lat, lng, v.lat, v.lng) }))
    .filter(({ v, d }) => d <= (v.kind === 'FESTIVAL' ? 1500 : 250))
    .sort((a, b) => a.d - b.d);
  for (const { v, d } of near) {
    const [live] = await performanceBriefs(db, and(liveWhere(), eq(performances.venueId, v.id)), viewerId, { limit: 1 });
    if (live) return { venue: venueDTO(v), performanceId: live.id, performerName: live.performer.name, distanceM: Math.round(d) };
  }
  return null;
}
