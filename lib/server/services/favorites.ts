/** Treasure Box favourites: saved songs and sets, friend shares, and imports from music apps. */
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { DB } from '../../db';
import { favorites, friendships, performanceLikes, performances, users } from '../../db/schema';
import type { PerformanceBrief, Track, UserBrief } from '../../types';
import { newId } from '../crypto';
import { bad, forbidden, notFound } from '../http';
import type { AuthedUser } from '../session';
import { performanceBriefs, userBrief } from './core';

export interface FavoriteDTO {
  id: string;
  kind: 'TRACK' | 'SET';
  track: Track | null;
  set: Pick<PerformanceBrief, 'id' | 'title' | 'status' | 'imageUrl' | 'performer' | 'venue'> | null;
  source: 'AUXED' | 'FRIEND' | 'SPOTIFY' | 'APPLE_MUSIC';
  from: UserBrief | null;
  note: string | null;
  createdAt: string;
}

export const trackKey = (t: Pick<Track, 'title' | 'artist'>) => `${t.title}|${t.artist}`.toLowerCase();

export async function listFavorites(db: DB, userId: string): Promise<{ items: FavoriteDTO[]; likedSets: PerformanceBrief[] }> {
  const rows = await db.select().from(favorites).where(eq(favorites.userId, userId)).orderBy(desc(favorites.createdAt)).limit(200);
  const perfIds = Array.from(new Set(rows.map((r) => r.performanceId).filter(Boolean) as string[]));
  const fromIds = Array.from(new Set(rows.map((r) => r.fromUserId).filter(Boolean) as string[]));
  const [briefs, fromUsers, liked] = await Promise.all([
    perfIds.length ? performanceBriefs(db, inArray(performances.id, perfIds), userId) : Promise.resolve([] as PerformanceBrief[]),
    fromIds.length ? db.select().from(users).where(inArray(users.id, fromIds)) : Promise.resolve([]),
    db.select({ id: performanceLikes.performanceId }).from(performanceLikes).where(eq(performanceLikes.userId, userId)).limit(60),
  ]);
  const likedSets = liked.length ? await performanceBriefs(db, inArray(performances.id, liked.map((l) => l.id)), userId, { orderBy: 'startsDesc' }) : [];
  const briefMap = new Map(briefs.map((b) => [b.id, b]));
  const fromMap = new Map(fromUsers.map((u) => [u.id, u]));
  const items = rows
    .map((r): FavoriteDTO | null => {
      const b = r.performanceId ? briefMap.get(r.performanceId) : undefined;
      if (r.kind === 'SET' && !b) return null;
      return {
        id: r.id,
        kind: r.kind,
        track: r.track ?? null,
        set: b ? { id: b.id, title: b.title, status: b.status, imageUrl: b.imageUrl, performer: b.performer, venue: b.venue } : null,
        source: r.source,
        from: r.fromUserId && fromMap.get(r.fromUserId) ? userBrief(fromMap.get(r.fromUserId)!) : null,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
      };
    })
    .filter(Boolean) as FavoriteDTO[];
  return { items, likedSets };
}

/** Save / unsave a song to your Treasure Box. */
export async function toggleFavoriteTrack(db: DB, user: AuthedUser, track: Track, performanceId: string | null) {
  const existing = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(
      and(
        eq(favorites.userId, user.id),
        eq(favorites.kind, 'TRACK'),
        eq(favorites.source, 'AUXED'),
        sql`lower(${favorites.track}->>'title') = lower(${track.title})`,
        sql`lower(${favorites.track}->>'artist') = lower(${track.artist})`,
      ),
    )
    .limit(1);
  if (existing[0]) {
    await db.delete(favorites).where(eq(favorites.id, existing[0].id));
    return { favorited: false };
  }
  await db.insert(favorites).values({ id: newId(), userId: user.id, kind: 'TRACK', track, performanceId, source: 'AUXED' });
  return { favorited: true };
}

export async function favoriteKeys(db: DB, userId: string) {
  const rows = await db
    .select({ title: sql<string>`${favorites.track}->>'title'`, artist: sql<string>`${favorites.track}->>'artist'` })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.kind, 'TRACK'), eq(favorites.source, 'AUXED')));
  return rows.map((r) => trackKey(r));
}

export async function removeFavorite(db: DB, user: AuthedUser, id: string) {
  const r = (await db.select().from(favorites).where(eq(favorites.id, id)).limit(1))[0];
  if (!r) throw notFound();
  if (r.userId !== user.id) throw forbidden();
  await db.delete(favorites).where(eq(favorites.id, id));
  return { ok: true };
}

/** Send a song or set to a friend's Treasure Box. */
export async function shareToFriend(db: DB, user: AuthedUser, friendId: string, input: { track?: Track | null; performanceId?: string | null; note?: string | null }) {
  if (friendId === user.id) throw bad("That's you!");
  const f = await db
    .select({ s: friendships.status })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, 'ACCEPTED'),
        or(and(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, friendId)), and(eq(friendships.requesterId, friendId), eq(friendships.addresseeId, user.id))),
      ),
    )
    .limit(1);
  if (!f[0]) throw forbidden('You can only share with friends.');
  if (!input.track && !input.performanceId) throw bad('Pick a song or set to share.');
  if (input.performanceId) {
    const p = (await db.select({ kind: performances.kind }).from(performances).where(eq(performances.id, input.performanceId)).limit(1))[0];
    if (!p) throw notFound('Set not found.');
    if (p.kind !== 'SET') throw bad('Private sessions can’t be shared this way — invite them instead.');
  }
  await db.insert(favorites).values({
    id: newId(),
    userId: friendId,
    kind: input.track ? 'TRACK' : 'SET',
    track: input.track ?? null,
    performanceId: input.performanceId ?? null,
    source: 'FRIEND',
    fromUserId: user.id,
    note: input.note?.slice(0, 200) || null,
  });
  return { ok: true };
}
