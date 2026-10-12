/**
 * Auto-queue: hand approved requests to real playback.
 *  - SPOTIFY: the owner's connected Spotify account. AUXED keeps the vote-ordered queue and hands
 *    Spotify one song at a time (Spotify's own queue can't be reordered), then reads what's
 *    actually playing so "now playing" and request statuses follow the speakers.
 *  - APPLE_MUSIC / YOUTUBE: the AUXED Player page (/player/[id]) runs on the device connected to
 *    the speakers, plays the queue itself and reports back.
 *  - SPOTIFY + AUXED Player: the player page becomes the account's Spotify Connect speaker (Web
 *    Playback SDK) and plays the queue like the other players; the hand-off above stands down.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { DB } from '../../db';
import { musicConnections, performances, requests, requestVotes, users, venues } from '../../db/schema';
import type { NowPlaying, PlaybackTarget, Track } from '../../types';
import { HttpError, bad, forbidden, notFound } from '../http';
import type { AuthedUser } from '../session';
import { spotifyAccess, spotifyNowPlaying, spotifyQueue, spotifyUriFor, youtubeIdFor } from '../musicConnect';
import { findOnItunes } from '../music';
import { recordPlay } from './setPlays';

/** The AUXED Player counts as open while it has checked in within this window. */
const PLAYER_ONLINE_MS = 60_000;
const playerDriving = (pb: PlaybackTarget) => !!pb.deviceId && !!pb.playerSeenAt && Date.now() - new Date(pb.playerSeenAt).getTime() < PLAYER_ONLINE_MS;
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
  const rows = await db
    .select({ r: requests, score })
    .from(requests)
    .where(and(eq(requests.performanceId, performanceId), eq(requests.status, 'QUEUED'), notHandedOff ? isNull(requests.externalQueuedAt) : undefined))
    .orderBy(desc(score), asc(requests.decidedAt))
    .limit(limit);
  return rows.map(({ r, score: s }) => ({ ...r, score: Number(s ?? 0) }));
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
  // The AUXED Player is the Spotify speaker and plays the queue itself.
  if (playerDriving(pb)) return perf;
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
  if (nowPlaying) await recordPlay(db, perf.id, nowPlaying);
  if (changed && nowPlaying) notifyNowPlaying(db, perf.id, await venueNameOf(db, perf), nowPlaying);
  return updated ?? perf;
}

/* ----------------------------------------------------------------------- AUXED Player */

export interface PlayerItem {
  requestId: string | null;
  track: Track;
  appleId: string | null;
  youtubeId: string | null;
  spotifyUri: string | null;
  requestedBy: { userName: string; avatarUrl: string | null; ring: string } | null;
  votes: number;
}

/** What the AUXED Player should play next (approved requests by votes, then the set list). */
export async function playerQueue(db: DB, user: AuthedUser, performanceId: string) {
  const perf = (await db.select().from(performances).where(eq(performances.id, performanceId)).limit(1))[0];
  if (!perf) throw notFound('Set not found.');
  if (!(await canControl(db, user, perf))) throw forbidden();
  const provider = perf.playback?.provider ?? null;
  if (!provider) throw bad('Turn on auto-queue (Spotify, Apple Music or YouTube) for this set first.');
  // Spotify: the speaker runs on the account of whoever opened the player.
  const spotifyToken = provider === 'SPOTIFY' ? await spotifyAccess(db, user.id) : null;
  if (provider === 'SPOTIFY' && !spotifyToken) throw new HttpError(409, 'Connect Spotify on this login to use the AUXED Player.', 'CONNECT_SPOTIFY');
  await db
    .update(performances)
    .set({ playback: { ...perf.playback!, playerSeenAt: new Date().toISOString() } })
    .where(eq(performances.id, perf.id));
  const queued = await queuedInOrder(db, perf.id, 5);
  const people = queued.length ? await db.select({ id: users.id, userName: users.userName, avatarUrl: users.avatarUrl, ring: users.ring }).from(users).where(inArray(users.id, queued.map((q) => q.userId))) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const items: PlayerItem[] = queued
    .filter((q) => q.track)
    .map((q) => {
      const u = byId.get(q.userId);
      return {
        requestId: q.id,
        track: q.track!,
        appleId: null,
        youtubeId: null,
        spotifyUri: null,
        requestedBy: u ? { userName: u.userName, avatarUrl: u.avatarUrl, ring: u.ring ?? '#FFFFFF' } : null,
        votes: Number(q.score ?? 0),
      };
    });
  // Then the artist's set list, continuing from where playback is (wrapping around).
  const n = perf.setlist.length;
  for (let k = 0; n && items.length < 5 && k < n; k++) {
    items.push({ requestId: null, track: perf.setlist[(perf.setCursor + k) % n], appleId: null, youtubeId: null, spotifyUri: null, requestedBy: null, votes: 0 });
  }
  for (const [i, it] of items.entries()) {
    if (it.track.source === 'itunes' && it.track.externalId) it.appleId = it.track.externalId;
    // Apple Music ids are iTunes ids: find the same recording for songs from elsewhere.
    else if (provider === 'APPLE_MUSIC' && i < 2) it.appleId = (await findOnItunes(it.track))?.externalId ?? null;
    if (provider === 'YOUTUBE' && i < 2) it.youtubeId = await youtubeIdFor(db, it.track);
    if (spotifyToken && i < 2) it.spotifyUri = await spotifyUriFor(db, spotifyToken, it.track).catch(() => null);
  }
  const account = provider === 'SPOTIFY' ? ((await db.select({ n: musicConnections.displayName }).from(musicConnections).where(and(eq(musicConnections.userId, user.id), eq(musicConnections.provider, 'SPOTIFY'))).limit(1))[0]?.n ?? null) : null;
  return { provider, title: perf.title, account, nowPlaying: perf.nowPlaying ?? null, items };
}

/** Player reports: its Spotify speaker is ready, or a song started / ended. */
export async function playerEvent(
  db: DB,
  user: AuthedUser,
  performanceId: string,
  ev: { event: 'started' | 'ended' | 'device'; requestId?: string | null; track?: Track | null; deviceId?: string | null },
) {
  const perf = (await db.select().from(performances).where(eq(performances.id, performanceId)).limit(1))[0];
  if (!perf) throw notFound('Set not found.');
  if (!(await canControl(db, user, perf))) throw forbidden();
  if (ev.event === 'device') {
    if (perf.playback?.provider !== 'SPOTIFY') throw bad('This set is not set to auto-queue on Spotify.');
    await db
      .update(performances)
      .set({ playback: { ...perf.playback, deviceId: ev.deviceId ?? null, playerSeenAt: new Date().toISOString(), lastError: null } })
      .where(eq(performances.id, perf.id));
    // Songs handed to the old device's queue are no longer in flight; the player takes over from here.
    await db.update(requests).set({ externalQueuedAt: null, externalRef: null }).where(and(eq(requests.performanceId, perf.id), eq(requests.status, 'QUEUED')));
    return { ok: true };
  }
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
  await recordPlay(db, perf.id, nowPlaying);
  notifyNowPlaying(db, perf.id, await venueNameOf(db, perf), nowPlaying);
  return { ok: true };
}
