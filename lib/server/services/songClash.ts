/**
 * Before a request goes in: is that song already waiting, playing right now, or already played in
 * this set? Songs are compared as recordings (feat. credits, punctuation and service differences
 * don't matter), so the same song from two searches is caught and the person can upvote instead.
 */
import { and, desc, eq, gt, inArray, or } from 'drizzle-orm';
import type { DB } from '../../db';
import { requests } from '../../db/schema';
import { FUZZY_THRESHOLD, artistSimilarity, looseName, recordingVersionsCompatible } from '../../matching';
import type { Track } from '../../types';
import { HttpError } from '../http';
import type { PerformanceRow } from './core';

/** The same recording, however each service writes it. */
export function sameSong(a: Pick<Track, 'title' | 'artist'>, b: Pick<Track, 'title' | 'artist'>) {
  if (looseName(a.title) !== looseName(b.title)) return false;
  return recordingVersionsCompatible(a.title, a.artist, b.title, b.artist) && artistSimilarity(a.artist, b.artist) >= FUZZY_THRESHOLD;
}

/** How long a played song counts as "already played tonight". */
const PLAYED_WINDOW_MS = 4 * 3600_000;

/**
 * Throws a friendly 409 when the song clashes. Waiting duplicates carry `DUPLICATE:<id>` so the app
 * can offer "Upvote it instead". `blockReplays` also refuses songs played earlier in the set.
 */
export async function checkSongClash(db: DB, perf: PerformanceRow, track: Track, opts: { blockReplays: boolean; duplicateMessage: string }) {
  if (perf.nowPlaying && sameSong(perf.nowPlaying.track, track)) throw new HttpError(409, "That's playing right now — enjoy it!", 'PLAYING_NOW');
  const rows = await db
    .select({ id: requests.id, track: requests.track, status: requests.status, playedAt: requests.playedAt })
    .from(requests)
    .where(
      and(
        eq(requests.performanceId, perf.id),
        eq(requests.kind, 'SONG'),
        or(inArray(requests.status, ['PENDING', 'QUEUED', 'PLAYING']), opts.blockReplays ? and(eq(requests.status, 'PLAYED'), gt(requests.playedAt, new Date(Date.now() - PLAYED_WINDOW_MS))) : undefined),
      ),
    )
    .orderBy(desc(requests.createdAt))
    .limit(300);
  const waiting = rows.find((r) => r.status !== 'PLAYED' && r.track && sameSong(r.track, track));
  if (waiting) {
    if (waiting.status === 'PLAYING') throw new HttpError(409, "That's playing right now — enjoy it!", 'PLAYING_NOW');
    throw new HttpError(409, opts.duplicateMessage, `DUPLICATE:${waiting.id}`);
  }
  const played = rows.find((r) => r.status === 'PLAYED' && r.track && sameSong(r.track, track));
  if (played?.playedAt) {
    const mins = Math.max(1, Math.round((Date.now() - played.playedAt.getTime()) / 60_000));
    const ago = mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
    throw new HttpError(409, `Already played in this set (${ago}) — ask for something new.`, 'PLAYED_TONIGHT');
  }
}
