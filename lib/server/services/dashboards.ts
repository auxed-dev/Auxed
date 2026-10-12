import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DB } from '../../db';
import { earnings, events, performances, performers, requests, venues } from '../../db/schema';
import type { PerformanceBrief, RequestDTO, VenueDTO } from '../../types';
import { DEFAULT_CONTROLS, performanceBriefs, requestDTOs, venueDTO } from './core';

const TZ = process.env.APP_TZ ?? 'Africa/Johannesburg';
const COUNTED = sql`${requests.status} in ('QUEUED','PLAYING','PLAYED')`;
const GENRE = sql<string>`case when ${requests.kind} = 'MIC' then 'On The Mic' else coalesce(nullif(${requests.track}->>'genre', ''), 'Other') end`;
const LOCAL_HOUR = sql<number>`extract(hour from ${requests.createdAt} at time zone ${TZ})`;

export interface NamedCount {
  name: string;
  count: number;
}

const toNum = (v: unknown) => Number(v ?? 0);

function slotLabel(startHour: number) {
  const s = Math.floor(startHour / 3) * 3;
  const pad = (h: number) => `${(h % 24).toString().padStart(2, '0')}:00`;
  return `${pad(s)}-${pad(s + 3)}`;
}

function pctSplit(rows: NamedCount[], top = 3): { name: string; count: number; pct: number }[] {
  const total = rows.reduce((a, r) => a + r.count, 0) || 1;
  const head = rows.slice(0, top);
  const rest = rows.slice(top).reduce((a, r) => a + r.count, 0);
  const list = rest ? [...head, { name: 'Other', count: rest }] : head;
  return list.map((r) => ({ ...r, pct: Math.round((r.count / total) * 1000) / 10 }));
}

/* ======================================================================= ARTIST */

export async function artistDashboard(db: DB, performerId: string, viewerId: string, venueFilter?: string) {
  const performer = (await db.select().from(performers).where(eq(performers.id, performerId)).limit(1))[0];
  if (!performer) return null;
  const mine = and(eq(performances.performerId, performerId), venueFilter ? eq(performances.venueId, venueFilter) : undefined);

  const [balance] = await db
    .select({ cents: sql<number>`coalesce(sum(${earnings.amountCents}), 0)` })
    .from(earnings)
    .where(and(eq(earnings.beneficiaryType, 'PERFORMER'), eq(earnings.beneficiaryId, performerId)));

  const genreRows = (
    await db
      .select({ name: GENRE, count: sql<number>`count(*)` })
      .from(requests)
      .innerJoin(performances, eq(performances.id, requests.performanceId))
      .where(and(mine, COUNTED))
      .groupBy(GENRE)
      .orderBy(desc(sql`count(*)`))
  ).map((r) => ({ name: r.name, count: toNum(r.count) }));

  const trackRows = await db
    .select({ title: sql<string>`${requests.track}->>'title'`, artist: sql<string>`${requests.track}->>'artist'`, n: sql<number>`count(*)` })
    .from(requests)
    .innerJoin(performances, eq(performances.id, requests.performanceId))
    .where(and(mine, COUNTED, eq(requests.kind, 'SONG')))
    .groupBy(sql`1`, sql`2`)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  const setRows = await db
    .select({ id: performances.id, title: performances.title, startsAt: performances.startsAt, venue: venues.name, n: sql<number>`count(${requests.id})` })
    .from(performances)
    .innerJoin(venues, eq(venues.id, performances.venueId))
    .leftJoin(requests, and(eq(requests.performanceId, performances.id), COUNTED))
    .where(mine)
    .groupBy(performances.id, venues.name)
    .orderBy(desc(sql`count(${requests.id})`))
    .limit(5);

  const score = sql<number>`${requests.baseUp} - ${requests.baseDown} + coalesce((select sum(value) from request_votes v where v.request_id = ${requests.id}), 0)`;
  const upvoted = await db
    .select({ title: sql<string>`${requests.track}->>'title'`, artist: sql<string>`${requests.track}->>'artist'`, score })
    .from(requests)
    .innerJoin(performances, eq(performances.id, requests.performanceId))
    .where(and(mine, COUNTED, eq(requests.kind, 'SONG')))
    .orderBy(desc(score))
    .limit(1);
  const nextPick = await db
    .select({ title: sql<string>`${requests.track}->>'title'`, artist: sql<string>`${requests.track}->>'artist'`, score })
    .from(requests)
    .innerJoin(performances, eq(performances.id, requests.performanceId))
    .where(and(mine, eq(requests.status, 'PENDING'), eq(requests.kind, 'SONG')))
    .orderBy(desc(score))
    .limit(1);

  const slot = await db
    .select({ h: sql<number>`floor(${LOCAL_HOUR} / 3) * 3`, n: sql<number>`count(*)` })
    .from(requests)
    .innerJoin(performances, eq(performances.id, requests.performanceId))
    .where(and(mine, COUNTED))
    .groupBy(sql`1`)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  const trending = await db
    .select({ venue: venues.name, n: sql<number>`count(*)` })
    .from(requests)
    .innerJoin(performances, eq(performances.id, requests.performanceId))
    .innerJoin(venues, eq(venues.id, performances.venueId))
    .where(and(eq(performances.performerId, performerId), COUNTED, sql`${requests.createdAt} > now() - interval '60 days'`))
    .groupBy(venues.name)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  // Set improvement: requests in the latest finished set vs the one before it.
  const lastSets = await db
    .select({ id: performances.id, n: sql<number>`count(${requests.id})` })
    .from(performances)
    .leftJoin(requests, and(eq(requests.performanceId, performances.id), COUNTED))
    .where(and(eq(performances.performerId, performerId), sql`(${performances.endedAt} is not null or ${performances.endsAt} < now())`))
    .groupBy(performances.id, performances.startsAt)
    .orderBy(desc(performances.startsAt))
    .limit(2);
  const improvement =
    lastSets.length === 2 && toNum(lastSets[1].n) > 0
      ? Math.round(((toNum(lastSets[0].n) - toNum(lastSets[1].n)) / toNum(lastSets[1].n)) * 100)
      : null;

  const bookings = await performanceBriefs(
    db,
    and(eq(performances.performerId, performerId), sql`${performances.endedAt} is null`, sql`(${performances.endsAt} > now() or ${performances.wentLiveAt} is not null)`),
    viewerId,
  );

  const activeIds = bookings.map((b) => b.id);
  const reqRows = activeIds.length
    ? await db
        .select()
        .from(requests)
        .where(and(inArray(requests.performanceId, activeIds), sql`${requests.status} <> 'REJECTED'`))
        .orderBy(desc(requests.createdAt))
        .limit(80)
    : [];
  const reqs = await requestDTOs(db, reqRows, viewerId);
  const statusOrder: Record<string, number> = { PENDING: 0, PLAYING: 1, QUEUED: 2, PLAYED: 3 };
  reqs.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.createdAt.localeCompare(a.createdAt));

  // Recommendations: what crowds request most in this artist's genres that isn't in their set yet.
  const genres = performer.genres.length ? performer.genres : genreRows.slice(0, 3).map((g) => g.name);
  const inSet = new Set<string>();
  const sets = await db.select({ setlist: performances.setlist }).from(performances).where(eq(performances.performerId, performerId));
  sets.forEach((s) => s.setlist.forEach((t) => inSet.add(`${t.title}|${t.artist}`.toLowerCase())));
  const recRows = await db
    .select({
      title: sql<string>`${requests.track}->>'title'`,
      artist: sql<string>`${requests.track}->>'artist'`,
      artwork: sql<string>`max(${requests.track}->>'artwork')`,
      n: sql<number>`count(*)`,
    })
    .from(requests)
    .where(and(COUNTED, eq(requests.kind, 'SONG'), genres.length ? inArray(sql`${requests.track}->>'genre'`, genres) : undefined))
    .groupBy(sql`1`, sql`2`)
    .orderBy(desc(sql`count(*)`))
    .limit(25);
  const recommendations = recRows
    .filter((r) => !inSet.has(`${r.title}|${r.artist}`.toLowerCase()))
    .slice(0, 5)
    .map((r) => ({ title: r.title, artist: r.artist, artwork: r.artwork, count: toNum(r.n) }));

  const fans = await db
    .select({ m: sql<string>`to_char(date_trunc('month', ${requests.createdAt} at time zone ${TZ}), 'Mon')`, mk: sql<string>`date_trunc('month', ${requests.createdAt} at time zone ${TZ})`, n: sql<number>`count(distinct ${requests.userId})` })
    .from(requests)
    .innerJoin(performances, eq(performances.id, requests.performanceId))
    .where(and(eq(performances.performerId, performerId), COUNTED, sql`${requests.createdAt} > now() - interval '6 months'`))
    .groupBy(sql`1`, sql`2`)
    .orderBy(sql`2`);

  const venueList = await db
    .selectDistinct({ id: venues.id, name: venues.name })
    .from(performances)
    .innerJoin(venues, eq(venues.id, performances.venueId))
    .where(eq(performances.performerId, performerId));

  const fmtSet = (s: (typeof setRows)[number] | undefined) =>
    s ? `${s.title}${s.title.includes(s.venue) ? '' : ` · ${s.venue}`}, ${s.startsAt.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', timeZone: TZ })}` : null;

  return {
    performer: { id: performer.id, name: performer.name, type: performer.type, genres: performer.genres, imageUrl: performer.imageUrl, bio: performer.bio, userId: performer.userId },
    controls: performer.controls ?? DEFAULT_CONTROLS,
    balanceCents: toNum(balance?.cents),
    genreSplit: pctSplit(genreRows),
    analytics: {
      trendySet: fmtSet(setRows[0]),
      topTrack: trackRows[0] ? `${trackRows[0].title} - ${trackRows[0].artist}` : null,
      topGenre: genreRows.find((g) => g.name !== 'On The Mic')?.name ?? null,
      topUpvoted: upvoted[0] ? `${upvoted[0].title} - ${upvoted[0].artist}` : null,
      nextPick: nextPick[0] ? `${nextPick[0].title} - ${nextPick[0].artist}` : null,
      timeSlot: slot[0] ? slotLabel(toNum(slot[0].h)) : null,
      trendingAt: trending[0]?.venue ?? null,
      improvementPct: improvement,
    },
    bookings,
    requests: reqs,
    trendingSets: setRows.map((s) => ({ name: s.title, venue: s.venue, date: s.startsAt.toISOString(), count: toNum(s.n) })),
    genreBars: genreRows.slice(0, 6),
    recommendations,
    fanGrowth: fans.map((f) => ({ name: f.m, count: toNum(f.n) })),
    venues: venueList,
  };
}

/* ======================================================================== OWNER */

export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';
const PERIOD_INTERVAL: Record<Period, string> = { daily: '1 day', weekly: '7 days', monthly: '30 days', yearly: '365 days' };

export async function ownerDashboard(db: DB, ownerId: string, viewerId: string, period: Period, venueFilter?: string) {
  const venueRows = await db.select().from(venues).where(eq(venues.ownerId, ownerId)).orderBy(venues.name);
  const allIds = venueRows.map((v) => v.id);
  const ids = venueFilter && allIds.includes(venueFilter) ? [venueFilter] : allIds;
  const empty = !ids.length;
  const inVenues = empty ? sql`false` : inArray(performances.venueId, ids);
  const venueEarn = empty ? sql`false` : and(eq(earnings.beneficiaryType, 'VENUE'), inArray(earnings.beneficiaryId, ids));

  const sumEarn = async (interval: string, offset = '0 days') => {
    const [r] = await db
      .select({ c: sql<number>`coalesce(sum(${earnings.amountCents}), 0)` })
      .from(earnings)
      .where(
        and(
          venueEarn,
          sql`${earnings.createdAt} > now() - ${offset}::interval - ${interval}::interval`,
          sql`${earnings.createdAt} <= now() - ${offset}::interval`,
        ),
      );
    return toNum(r?.c);
  };
  const sumGross = async (interval: string) => {
    const [r] = await db
      .select({ c: sql<number>`coalesce(sum(${requests.priceCents}), 0)` })
      .from(requests)
      .innerJoin(performances, eq(performances.id, requests.performanceId))
      .where(and(inVenues, COUNTED, sql`${requests.createdAt} > now() - ${interval}::interval`));
    return toNum(r?.c);
  };

  const revenueCents = await sumEarn(PERIOD_INTERVAL[period]);
  const [last30, prev30, cashFlow, profit] = await Promise.all([sumEarn('30 days'), sumEarn('30 days', '30 days'), sumGross('90 days'), sumEarn('90 days')]);

  const genreRows = (
    await db
      .select({ name: GENRE, count: sql<number>`count(*)` })
      .from(requests)
      .innerJoin(performances, eq(performances.id, requests.performanceId))
      .where(and(inVenues, COUNTED))
      .groupBy(GENRE)
      .orderBy(desc(sql`count(*)`))
  ).map((r) => ({ name: r.name, count: toNum(r.count) }));
  const musicGenres = genreRows.filter((g) => g.name !== 'On The Mic' && g.name !== 'Other');

  const genreProfitRows = await db
    .select({ name: GENRE, c: sql<number>`sum(${earnings.amountCents})` })
    .from(earnings)
    .innerJoin(requests, eq(requests.id, earnings.requestId))
    .where(venueEarn)
    .groupBy(GENRE)
    .orderBy(desc(sql`sum(${earnings.amountCents})`));
  const profitTotal = genreProfitRows.reduce((a, r) => a + toNum(r.c), 0) || 1;

  const weekly = await db
    .select({ wk: sql<string>`date_trunc('week', ${requests.createdAt} at time zone ${TZ})`, n: sql<number>`count(*)` })
    .from(requests)
    .innerJoin(performances, eq(performances.id, requests.performanceId))
    .where(and(inVenues, COUNTED, sql`${requests.createdAt} > date_trunc('year', now())`))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const weeklyEarn = await db
    .select({ wk: sql<string>`date_trunc('week', ${earnings.createdAt} at time zone ${TZ})`, c: sql<number>`sum(${earnings.amountCents})` })
    .from(earnings)
    .where(and(venueEarn, sql`${earnings.createdAt} > now() - interval '26 weeks'`))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const topSong = await db
    .select({ t: sql<string>`(${requests.track}->>'artist') || ' - ' || (${requests.track}->>'title')`, n: sql<number>`count(*)` })
    .from(requests)
    .innerJoin(performances, eq(performances.id, requests.performanceId))
    .where(and(inVenues, COUNTED, eq(requests.kind, 'SONG')))
    .groupBy(sql`1`)
    .orderBy(desc(sql`count(*)`))
    .limit(1);
  const topSlot = await db
    .select({ h: sql<number>`floor(${LOCAL_HOUR} / 3) * 3`, n: sql<number>`count(*)` })
    .from(requests)
    .innerJoin(performances, eq(performances.id, requests.performanceId))
    .where(and(inVenues, COUNTED))
    .groupBy(sql`1`)
    .orderBy(desc(sql`count(*)`))
    .limit(1);
  const byVenue = await db
    .select({ id: earnings.beneficiaryId, c: sql<number>`sum(${earnings.amountCents})` })
    .from(earnings)
    .where(venueEarn)
    .groupBy(earnings.beneficiaryId)
    .orderBy(desc(sql`sum(${earnings.amountCents})`));
  const topEvent = await db
    .select({ title: events.title, n: sql<number>`count(*)` })
    .from(requests)
    .innerJoin(performances, eq(performances.id, requests.performanceId))
    .innerJoin(events, eq(events.id, performances.eventId))
    .where(and(inVenues, COUNTED))
    .groupBy(events.title)
    .orderBy(desc(sql`count(*)`))
    .limit(1);
  const repeat = await db
    .select({ users: sql<number>`count(*)`, repeaters: sql<number>`count(*) filter (where n > 1)` })
    .from(
      db
        .select({ u: requests.userId, n: sql<number>`count(*)`.as('n') })
        .from(requests)
        .innerJoin(performances, eq(performances.id, requests.performanceId))
        .where(and(inVenues, COUNTED, sql`${requests.createdAt} > now() - interval '90 days'`))
        .groupBy(requests.userId)
        .as('per_user'),
    );
  const statusRows = await db
    .select({ name: requests.status, count: sql<number>`count(*)` })
    .from(requests)
    .innerJoin(performances, eq(performances.id, requests.performanceId))
    .where(and(inVenues, sql`${requests.createdAt} > now() - interval '30 days'`))
    .groupBy(requests.status);

  const upcoming = empty
    ? []
    : await performanceBriefs(db, and(inArray(performances.venueId, ids), sql`${performances.endedAt} is null`, sql`(${performances.endsAt} > now() or ${performances.wentLiveAt} is not null)`), viewerId);
  const artistsSeen = new Set<string>();
  const artists = upcoming.filter((b) => (artistsSeen.has(b.performer.id) ? false : (artistsSeen.add(b.performer.id), true)));

  // Linear projection of weekly venue revenue for the next 8 weeks.
  const pts = weeklyEarn.map((w, i) => ({ x: i, y: toNum(w.c) }));
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p.x, 0);
  const sy = pts.reduce((a, p) => a + p.y, 0);
  const sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
  const sxx = pts.reduce((a, p) => a + p.x * p.x, 0);
  const slope = n > 1 ? (n * sxy - sx * sy) / (n * sxx - sx * sx || 1) : 0;
  const intercept = n ? (sy - slope * sx) / n : 0;
  const projection = [
    ...pts.map((p, i) => ({ name: new Date(weeklyEarn[i].wk).toISOString().slice(0, 10), cents: p.y, projected: false })),
    ...Array.from({ length: 8 }, (_, k) => {
      const x = n + k;
      const d = new Date(n ? new Date(weeklyEarn[n - 1].wk).getTime() + (k + 1) * 7 * 86400_000 : Date.now());
      return { name: d.toISOString().slice(0, 10), cents: Math.max(0, Math.round(intercept + slope * x)), projected: true };
    }),
  ];

  const venueDTOs: VenueDTO[] = venueRows.map(venueDTO);
  const selected = venueRows.filter((v) => ids.includes(v.id));
  const nameOf = new Map(venueRows.map((v) => [v.id, v.name]));
  const reps = repeat[0];

  return {
    venues: venueDTOs,
    period,
    revenueCents,
    stats: {
      liveCapacity: selected.reduce((a, v) => a + v.liveCapacity, 0),
      capacity: selected.reduce((a, v) => a + v.capacity, 0),
      avgWeek: selected.reduce((a, v) => a + v.avgWeek, 0),
      avgMonth: selected.reduce((a, v) => a + v.avgMonth, 0),
      topGenre: musicGenres[0]?.name ?? null,
      medianGenre: musicGenres.length ? musicGenres[Math.floor((musicGenres.length - 1) / 2)].name : null,
      aveGenres: musicGenres.slice(0, 3).map((g) => g.name),
    },
    volume: weekly.map((w) => ({ name: new Date(w.wk).toISOString().slice(0, 10), count: toNum(w.n) })),
    financial: {
      dailyCents: Math.round(last30 / 30),
      growthPct: prev30 > 0 ? Math.round(((last30 - prev30) / prev30) * 100) : null,
      cashFlowCents: cashFlow,
      profitCents: profit,
      retentionPct: toNum(reps?.users) > 0 ? Math.round((toNum(reps?.repeaters) / toNum(reps?.users)) * 100) : null,
      topSong: topSong[0]?.t ?? null,
      topTime: topSlot[0] ? slotLabel(toNum(topSlot[0].h)) : null,
      topVenue: byVenue[0] ? nameOf.get(byVenue[0].id) ?? null : null,
      topEvent: topEvent[0]?.title ?? null,
    },
    genreProfit: genreProfitRows.slice(0, 5).map((g) => ({ name: g.name, cents: toNum(g.c), pct: Math.round((toNum(g.c) / profitTotal) * 1000) / 10 })),
    genreBars: genreRows.slice(0, 6),
    requestSystem: statusRows.map((s) => ({ name: s.name, count: toNum(s.count) })),
    projection,
    mapping: byVenue.map((b) => ({ name: nameOf.get(b.id) ?? 'Venue', count: toNum(b.c) })),
    upcoming: upcoming as PerformanceBrief[],
    artists: artists as PerformanceBrief[],
  };
}

export type ArtistDashboard = NonNullable<Awaited<ReturnType<typeof artistDashboard>>>;
export type OwnerDashboard = Awaited<ReturnType<typeof ownerDashboard>>;
export type { RequestDTO };
