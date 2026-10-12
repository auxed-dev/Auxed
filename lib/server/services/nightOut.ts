/**
 * Guardrails for a night out: a spending cap per 12 hours, a 30-second undo on requests, and quick
 * picks tailored to what's playing and what the person likes.
 */
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { DB } from '../../db';
import { favorites, ledger, performances, requests, venues } from '../../db/schema';
import { T } from '../../db/catalog';
import { songPriceCents, exceedsMaxLength } from '../../pricing';
import type { PublicControls, Suggestion, Track } from '../../types';
import { HttpError, bad, forbidden, notFound } from '../http';
import type { AuthedUser } from '../session';
import { credit } from './wallet';

export const UNDO_SECONDS = 30;
const WINDOW_MS = 12 * 3600_000;

/** Throws if this request would take the person past their spending cap. */
export async function checkSpendCap(db: DB, user: AuthedUser, priceCents: number) {
  if (!user.spendCapCents || priceCents <= 0) return;
  const [{ spent }] = await db
    .select({ spent: sql<number>`coalesce(-sum(${ledger.amountCents}), 0)` })
    .from(ledger)
    .where(and(eq(ledger.userId, user.id), inArray(ledger.type, ['REQUEST', 'REFUND']), gt(ledger.createdAt, new Date(Date.now() - WINDOW_MS))));
  const used = Math.max(0, Number(spent));
  if (used + priceCents > user.spendCapCents) {
    const left = Math.max(0, user.spendCapCents - used);
    throw new HttpError(
      402,
      `That would take you past your night-out limit of R${(user.spendCapCents / 100).toFixed(0)} (R${(left / 100).toFixed(2)} left). You can change it in Profile.`,
      'SPEND_CAP',
    );
  }
}

/** Undo a request within 30 seconds (full refund). */
export async function cancelRequest(db: DB, user: AuthedUser, requestId: string) {
  const r = (await db.select().from(requests).where(eq(requests.id, requestId)).limit(1))[0];
  if (!r) throw notFound('Request not found.');
  if (r.userId !== user.id) throw forbidden();
  if (Date.now() - r.createdAt.getTime() > UNDO_SECONDS * 1000) throw bad('Too late to undo — the request is already with the artist.');
  if (r.status !== 'PENDING' && r.status !== 'QUEUED') throw bad('This request can no longer be undone.');
  await db.transaction(async (tx) => {
    const done = await tx
      .update(requests)
      .set({ status: 'REJECTED', decidedAt: new Date() })
      .where(and(eq(requests.id, r.id), inArray(requests.status, ['PENDING', 'QUEUED'])))
      .returning({ id: requests.id });
    if (!done.length || r.priceCents <= 0) return;
    await credit(tx, user.id, r.priceCents, 'REFUND', 'Request undone — refunded', { requestId: r.id });
  });
  return { ok: true };
}

const key = (t: Pick<Track, 'title' | 'artist'>) => `${t.title}|${t.artist}`.toLowerCase();

/**
 * How well a genre fits tonight: the DJ's genre mix from Creative Controls (weighted), the venue's
 * house sound, and what's playing now. Related genres count partly ("Afro House" fits "House").
 * Songs that fit neither the DJ nor the venue are pushed down rather than hidden.
 */
export function genreFit(genre: string | undefined, dj: Map<string, number>, house: Set<string>, nowGenre: string | null) {
  const g = genre?.toLowerCase().trim();
  if (!g) return 0;
  const related = (a: string, b: string) => a !== b && (a.includes(b) || b.includes(a));
  let djWeight = dj.get(g) ?? 0;
  if (!djWeight) for (const [name, w] of dj) if (related(g, name)) djWeight = Math.max(djWeight, w * 0.6);
  const inHouse = house.has(g) || [...house].some((h) => related(g, h));
  let fit = (djWeight / 100) * 14 + (inHouse ? 6 : 0) + (nowGenre === g ? 8 : 0);
  if ((dj.size || house.size) && !djWeight && !inHouse && nowGenre !== g) fit -= 10;
  return fit;
}

/**
 * Top 10 quick picks for a set: what's already in the queue (upvote), the person's saved and
 * imported favourites, what this crowd and venue request most, the artist's own set list, and
 * what's big in tonight's genres — all ranked by how well they fit the DJ's genre mix, the venue's
 * house sound and what's playing. Filtered by the artist's max song length.
 */
export async function suggestions(
  db: DB,
  perf: typeof performances.$inferSelect,
  controls: PublicControls,
  viewerId: string | null,
  free: boolean,
): Promise<Suggestion[]> {
  const out = new Map<string, Suggestion & { score: number }>();
  const nowKey = perf.nowPlaying ? key(perf.nowPlaying.track) : '';
  const nowGenre = perf.nowPlaying?.track.genre?.toLowerCase() ?? null;
  const dj = new Map(controls.genres.filter((g) => g.weight > 0).map((g) => [g.name.toLowerCase(), g.weight]));
  const venue = perf.venueId ? (await db.select({ musicGenres: venues.musicGenres }).from(venues).where(eq(venues.id, perf.venueId)).limit(1))[0] : undefined;
  const house = new Set((venue?.musicGenres ?? []).map((g) => g.toLowerCase()));
  const priced = (t: Track) => (free ? 0 : songPriceCents(t, controls));
  const add = (t: Track | null | undefined, reason: string, score: number, requestId?: string) => {
    if (!t || !t.title || !t.artist) return;
    const k = key(t);
    if (k === nowKey || exceedsMaxLength(t, controls)) return;
    const genreBoost = genreFit(t.genre, dj, house, nowGenre);
    const cur = out.get(k);
    if (cur) {
      cur.score += score / 2;
      if (requestId) {
        cur.requestId = requestId;
        cur.reason = reason;
      }
      return;
    }
    out.set(k, { track: t, reason, score: score + genreBoost, requestId, priceCents: priced(t) });
  };

  // 1) Already waiting in this queue -> upvote (ranked by votes).
  const queued = await db
    .select({ id: requests.id, track: requests.track, up: requests.baseUp })
    .from(requests)
    .where(and(eq(requests.performanceId, perf.id), inArray(requests.status, ['PENDING', 'QUEUED']), eq(requests.kind, 'SONG')))
    .orderBy(desc(requests.baseUp))
    .limit(5);
  queued.forEach((q, i) => add(q.track, 'In the queue — upvote it', 40 - i * 4, q.id));

  // 2) Your favourites (saved in AUXED, from friends, imported from Spotify / Apple Music).
  if (viewerId) {
    const favs = await db
      .select({ track: favorites.track, source: favorites.source })
      .from(favorites)
      .where(and(eq(favorites.userId, viewerId), eq(favorites.kind, 'TRACK')))
      .orderBy(desc(favorites.createdAt))
      .limit(40);
    favs.forEach((f, i) =>
      add(
        f.track,
        f.source === 'SPOTIFY' ? 'From your Spotify' : f.source === 'APPLE_MUSIC' ? 'From your Apple Music' : f.source === 'FRIEND' ? 'A friend sent you this' : 'In your Treasure Box',
        30 - i * 0.5,
      ),
    );
  }

  // 3) What crowds request most here (this venue) and for this artist, last 30 days.
  const since = new Date(Date.now() - 30 * 86400_000);
  const scope = perf.venueId ? eq(performances.venueId, perf.venueId) : eq(performances.id, perf.id);
  const trending = await db
    .select({ track: sql<Track>`(array_agg(${requests.track}))[1]`, n: sql<number>`count(*)` })
    .from(requests)
    .innerJoin(performances, eq(performances.id, requests.performanceId))
    .where(and(scope, eq(requests.kind, 'SONG'), gt(requests.createdAt, since), sql`${requests.status} <> 'REJECTED'`))
    .groupBy(sql`lower(${requests.track}->>'title')`, sql`lower(${requests.track}->>'artist')`)
    .orderBy(desc(sql`count(*)`))
    .limit(12);
  trending.forEach((t, i) => add(t.track, perf.venueId ? 'Trending here' : 'Popular in this session', 22 - i));

  if (perf.performerId) {
    const forArtist = await db
      .select({ track: sql<Track>`(array_agg(${requests.track}))[1]`, n: sql<number>`count(*)` })
      .from(requests)
      .innerJoin(performances, eq(performances.id, requests.performanceId))
      .where(and(eq(performances.performerId, perf.performerId), eq(requests.kind, 'SONG'), gt(requests.createdAt, since), sql`${requests.status} <> 'REJECTED'`))
      .groupBy(sql`lower(${requests.track}->>'title')`, sql`lower(${requests.track}->>'artist')`)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    forArtist.forEach((t, i) => add(t.track, 'This crowd loves it', 18 - i));
  }

  // 4) The artist's set list (not played yet) and songs in the genre that's on now.
  perf.setlist.slice(perf.setCursor).forEach((t, i) => add(t, 'On the set list', 12 - i));
  if (nowGenre) {
    Object.values(T)
      .filter((t) => t.genre?.toLowerCase() === nowGenre)
      .forEach((t) => add(t, `${perf.nowPlaying!.track.genre} · like what's playing`, 6));
  }
  // 5) Big right now in tonight's genres (the DJ's mix and the house sound), across AUXED.
  const tonight = [...new Set([...dj.keys(), ...house])];
  if (tonight.length) {
    const big = await db
      .select({ track: sql<Track>`(array_agg(${requests.track}))[1]`, genre: sql<string>`lower(${requests.track}->>'genre')`, n: sql<number>`count(*)` })
      .from(requests)
      .where(and(eq(requests.kind, 'SONG'), gt(requests.createdAt, since), sql`${requests.status} <> 'REJECTED'`, inArray(sql`lower(${requests.track}->>'genre')`, tonight)))
      .groupBy(sql`lower(${requests.track}->>'title')`, sql`lower(${requests.track}->>'artist')`, sql`lower(${requests.track}->>'genre')`)
      .orderBy(desc(sql`count(*)`))
      .limit(15);
    big.forEach((b, i) => add(b.track, `Big in ${b.track.genre ?? 'this genre'} right now`, 10 - i * 0.5));
    // And the catalogue's songs in those genres, so a quiet night still has picks that fit.
    Object.values(T)
      .filter((t) => t.genre && tonight.includes(t.genre.toLowerCase()))
      .forEach((t) => add(t, house.has(t.genre!.toLowerCase()) ? 'Fits the house sound' : 'Fits the vibe', 3));
  }

  return Array.from(out.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ track, reason, requestId, priceCents }) => ({ track, reason, requestId, priceCents }));
}
