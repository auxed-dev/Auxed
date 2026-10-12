/**
 * Auto-queue: hand approved requests to real playback.
 *  - SPOTIFY: the owner's connected Spotify account. AUXED keeps the vote-ordered queue and hands
 *    Spotify one song at a time (Spotify's own queue can't be reordered), then reads what's
 *    actually playing so "now playing" and request statuses follow the speakers.
 *  - APPLE_MUSIC / YOUTUBE: the AUXED Player page (/player/[id]) runs on the device connected to
 *    the speakers, plays the queue itself and reports back.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { DB } from '../../db';
import { performances, requests, requestVotes, venues } from '../../db/schema';
import type { NowPlaying, PlaybackTarget, Track } from '../../types';
import { HttpError, bad, forbidden, notFound } from '../http';
import type { AuthedUser } from '../session';
import { spotifyAccess, spotifyNowPlaying, spotifyQueue, spotifyUriFor, youtubeIdFor } from '../musicConnect';
import { notifyNowPlaying, notifyUser } from '../push';
import { loadPerformance, type PerformanceRow } from './core';

type Provider = PlaybackTarget['provider'];

export async function canControl(db: DB, user: AuthedUser, perf: PerformanceRow) {
  if (user.role === 'ADMIN') return true;
  if (perf.kind === 'HOME') return perf.hostUserId === user.id;
  const row = await loadPerformance(db, perf.id);
  return !!row && (row.pf.userId === user.id || row.v.ownerId === user.id);
}

export async function setPlayback(db: DB, user: AuthedUser, performanceId: string, provider: Provider | null) {
  const perf = (await db.select().from(performances).where(eq(performances.id, performanceId)).limit(1))[0];
  if (!perf) throw notFound('Set not found.');
  if (!(await canControl(db, user, perf))) throw forbidden('Only the artist, venue or host can change playback.');
  if (provider === 'SPOTIFY' && !(await spotifyAccess(db, user.id))) throw new HttpError(409, 'Connect your Spotify account first (Profile → Music connections).', 'CONNECT_SPOTIFY');
  const playback: PlaybackTarget | null = provider ? { provider, ownerUserId: user.id, playerSeenAt: null, lastError: null } : null;
  await db.update(performances).set({ playback }).where(eq(performances.id, performanceId));
  // Songs handed to the old target are no longer "in flight".
  await db.update(requests).set({ externalQueuedAt: null, externalRef: null }).where(and(eq(requests.performanceId, performanceId), eq(requests.status, 'QUEUED')));
  return { playback };
}

const score = sql<number>`${requests.baseUp} - ${requests.baseDown} + coalesce((select sum(${requestVotes.value}) from ${requestVotes} where ${requestVotes.requestId} = ${requests.id}), 0)`;

async function queuedInOrder(db: DB, performanceId: string, limit: number, notHandedOff = false) {
  return db
    .select()
    .from(requests)
    .where(and(eq(requests.performanceId, performanceId), eq(requests.status, 'QUEUED'), notHandedOff ? isNull(requests.externalQueuedAt) : undefined))
    .orderBy(desc(score), asc(requests.decidedAt))
    .limit(limit);
}

async function venueNameOf(db: DB, perf: PerformanceRow) {
  if (!perf.venueId) return perf.title;
  return (await db.select({ n: venues.name }).from(venues).where(eq(venues.id, perf.venueId)).limit(1))[0]?.n ?? perf.title;
}

async function markPlaying(db: DB, perf: PerformanceRow, requestId: string | null) {
  await db
    .update(requests)
    .set({ status: 'PLAYED', playedAt: new Date() })
    .where(and(eq(requests.performanceId, perf.id), eq(requests.status, 'PLAYING'), requestId ? sql`${requests.id} <> ${requestId}` : undefined));
  if (!requestId) return;
  const r = (await db.update(requests).set({ status: 'PLAYING', externalQueuedAt: sql`coalesce(${requests.externalQueuedAt}, now())` }).where(eq(requests.id, requestId)).returning())[0];
  if (r && r.status === 'PLAYING') {
    notifyUser(db, r.userId, { title: 'Your request is playing 🎉', body: r.track ? `${r.track.title} — ${r.track.artist}` : 'Your On The Mic message is on now', tag: `req-${r.id}`, url: `/sets/${perf.id}` });
  }
}

const lastSync = new Map<string, number>();

/** Keep a set in step with the connected Spotify account (called whenever the room is loaded). */
export async function syncExternal(db: DB, perf: PerformanceRow): Promise<PerformanceRow> {
  const pb = perf.playback;
  if (!pb || pb.provider !== 'SPOTIFY' || perf.endedAt) return perf;
  if (Date.now() - (lastSync.get(perf.id) ?? 0) < 5000) return perf;
  lastSync.set(perf.id, Date.now());
  let error: string | null = null;
  let nowPlaying: NowPlaying | null = perf.nowPlaying ?? null;
  try {
    const token = await spotifyAccess(db, pb.ownerUserId);
    if (!token) throw new HttpError(409, 'The Spotify connection has expired — reconnect it in Profile.');
    const now = await spotifyNowPlaying(token);
    if (now) {
      const match = (
        await db
          .select()
          .from(requests)
          .where(and(eq(requests.performanceId, perf.id), eq(requests.externalRef, now.uri), inArray(requests.status, ['QUEUED', 'PLAYING'])))
          .limit(1)
      )[0];
      if (match && match.status !== 'PLAYING') await markPlaying(db, perf, match.id);
      if (!match) await markPlaying(db, perf, null);
      nowPlaying = { track: match?.track ?? now.track, startedAt: new Date(Date.now() - now.progressMs).toISOString(), requestId: match?.id };
    }
    // Hand the next song over once the previous hand-off has started playing.
    const inFlight = await db
      .select({ id: requests.id })
      .from(requests)
      .where(and(eq(requests.performanceId, perf.id), eq(requests.status, 'QUEUED'), isNotNull(requests.externalQueuedAt)))
      .limit(1);
    if (!inFlight[0]) {
      const [next] = await queuedInOrder(db, perf.id, 1, true);
      if (next?.track) {
        const uri = await spotifyUriFor(db, token, next.track);
        if (uri) {
          await spotifyQueue(token, uri);
          await db.update(requests).set({ externalQueuedAt: new Date(), externalRef: uri }).where(eq(requests.id, next.id));
        } else {
          error = `Couldn't find "${next.track.title}" on Spotify — play it manually.`;
          await db.update(requests).set({ externalQueuedAt: new Date(), externalRef: 'not-found' }).where(eq(requests.id, next.id));
        }
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Spotify sync failed.';
  }
  const changed = JSON.stringify(nowPlaying?.track.title) !== JSON.stringify(perf.nowPlaying?.track.title);
  const [updated] = await db
    .update(performances)
    .set({ nowPlaying, playback: { ...pb, lastError: error } })
    .where(eq(performances.id, perf.id))
    .returning();
  if (changed && nowPlaying) notifyNowPlaying(db, perf.id, await venueNameOf(db, perf), nowPlaying);
  return updated ?? perf;
}

/* ----------------------------------------------------------------------- AUXED Player */

export interface PlayerItem {
  requestId: string | null;
  track: Track;
  appleId: string | null;
  youtubeId: string | null;
  requestedBy: string | null;
}

/** What the AUXED Player should play next (approved requests by votes, then the set list). */
export async function playerQueue(db: DB, user: AuthedUser, performanceId: string) {
  const perf = (await db.select().from(performances).where(eq(performances.id, performanceId)).limit(1))[0];
  if (!perf) throw notFound('Set not found.');
  if (!(await canControl(db, user, perf))) throw forbidden();
  const provider = perf.playback?.provider ?? null;
  if (provider !== 'APPLE_MUSIC' && provider !== 'YOUTUBE') throw bad('Choose Apple Music or YouTube as the playback for this set first.');
  await db
    .update(performances)
    .set({ playback: { ...perf.playback!, playerSeenAt: new Date().toISOString() } })
    .where(eq(performances.id, perf.id));
  const queued = await queuedInOrder(db, perf.id, 5);
  const items: PlayerItem[] = queued.filter((q) => q.track).map((q) => ({ requestId: q.id, track: q.track!, appleId: null, youtubeId: null, requestedBy: null }));
  // Then the artist's set list, continuing from where playback is (wrapping around).
  const n = perf.setlist.length;
  for (let k = 0; n && items.length < 5 && k < n; k++) {
    items.push({ requestId: null, track: perf.setlist[(perf.setCursor + k) % n], appleId: null, youtubeId: null, requestedBy: null });
  }
  for (const [i, it] of items.entries()) {
    if (it.track.source === 'itunes' && it.track.externalId) it.appleId = it.track.externalId;
    if (provider === 'YOUTUBE' && i < 2) it.youtubeId = await youtubeIdFor(db, it.track);
  }
  return { provider, title: perf.title, nowPlaying: perf.nowPlaying ?? null, items };
}

/** Player reports: a song started, ended, or a heartbeat. */
export async function playerEvent(db: DB, user: AuthedUser, performanceId: string, ev: { event: 'started' | 'ended'; requestId?: string | null; track?: Track | null }) {
  const perf = (await db.select().from(performances).where(eq(performances.id, performanceId)).limit(1))[0];
  if (!perf) throw notFound('Set not found.');
  if (!(await canControl(db, user, perf))) throw forbidden();
  if (ev.event === 'ended') {
    if (ev.requestId) await db.update(requests).set({ status: 'PLAYED', playedAt: new Date() }).where(and(eq(requests.id, ev.requestId), eq(requests.performanceId, perf.id)));
    return { ok: true };
  }
  let track = ev.track ?? null;
  if (ev.requestId) {
    const r = (await db.select().from(requests).where(and(eq(requests.id, ev.requestId), eq(requests.performanceId, perf.id))).limit(1))[0];
    if (!r) throw notFound('Request not found.');
    track = r.track ?? track;
  }
  if (!track) throw bad('Missing track.');
  await markPlaying(db, perf, ev.requestId ?? null);
  const nowPlaying: NowPlaying = { track, startedAt: new Date().toISOString(), requestId: ev.requestId ?? undefined };
  await db
    .update(performances)
    .set({ nowPlaying, setCursor: ev.requestId ? perf.setCursor : perf.setCursor + 1, wentLiveAt: perf.wentLiveAt ?? new Date() })
    .where(eq(performances.id, perf.id));
  notifyNowPlaying(db, perf.id, await venueNameOf(db, perf), nowPlaying);
  return { ok: true };
}
