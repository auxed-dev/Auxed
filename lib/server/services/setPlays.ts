/**
 * A set's playlist: every song that actually played, in order, whether it was a request or the
 * DJ's own pick. It builds up while the set is live (AUX IN listeners go back and forward through
 * it) and stays as the set's playlist once it ends.
 */
import { and, asc, desc, eq, inArray, isNull, isNotNull, sql } from 'drizzle-orm';
import type { DB } from '../../db';
import { requests, requestVotes, setPlays, users } from '../../db/schema';
import type { NowPlaying, Track } from '../../types';
import { newId } from '../crypto';
import { perfStatus, type PerformanceRow } from './core';
import { sameSong } from './songClash';

/** Log a change of "now playing" (null = nothing playing any more). Repeats of the same play are ignored. */
export async function recordPlay(db: DB, performanceId: string, np: NowPlaying | null) {
  const [open] = await db
    .select()
    .from(setPlays)
    .where(and(eq(setPlays.performanceId, performanceId), isNull(setPlays.endedAt)))
    .orderBy(desc(setPlays.startedAt))
    .limit(1);
  const at = np ? new Date(np.startedAt) : new Date();
  if (np && open && sameSong(open.track, np.track) && Math.abs(open.startedAt.getTime() - at.getTime()) < 20_000) return;
  if (open) await db.update(setPlays).set({ endedAt: at > open.startedAt ? at : new Date() }).where(eq(setPlays.id, open.id));
  if (np) await db.insert(setPlays).values({ id: newId(), performanceId, track: np.track, requestId: np.requestId ?? null, startedAt: at });
}

export interface PlaylistEntry {
  id: string;
  track: Track;
  requestId: string | null;
  startedAt: string;
  endedAt: string | null;
  requestedBy: { userName: string; avatarUrl: string | null; ring: string } | null;
}

export interface UpNextEntry {
  requestId: string;
  track: Track;
  votes: number;
  requestedBy: { userName: string; avatarUrl: string | null; ring: string } | null;
}

export interface SetPlaylist {
  live: boolean;
  nowPlaying: NowPlaying | null;
  played: PlaylistEntry[];
  upNext: UpNextEntry[];
}

const score = sql<number>`${requests.baseUp} - ${requests.baseDown} + coalesce((select sum(${requestVotes.value}) from ${requestVotes} where ${requestVotes.requestId} = ${requests.id}), 0)`;

async function people(db: DB, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, PlaylistEntry['requestedBy']>();
  const rows = await db.select({ id: users.id, userName: users.userName, avatarUrl: users.avatarUrl, ring: users.ring }).from(users).where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, { userName: r.userName, avatarUrl: r.avatarUrl, ring: r.ring ?? '#FFFFFF' }]));
}

export async function setPlaylist(db: DB, perf: PerformanceRow): Promise<SetPlaylist> {
  let rows = await db.select().from(setPlays).where(eq(setPlays.performanceId, perf.id)).orderBy(asc(setPlays.startedAt)).limit(400);
  let played: Omit<PlaylistEntry, 'requestedBy'>[] = rows.map((r) => ({
    id: r.id,
    track: r.track,
    requestId: r.requestId,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
  }));
  // Sets from before the playlist was kept: rebuild it from the requests that played.
  if (!rows.length) {
    const reqs = await db
      .select({ id: requests.id, track: requests.track, playedAt: requests.playedAt })
      .from(requests)
      .where(and(eq(requests.performanceId, perf.id), eq(requests.status, 'PLAYED'), isNotNull(requests.playedAt), isNotNull(requests.track)))
      .orderBy(asc(requests.playedAt))
      .limit(400);
    played = reqs.map((r) => ({ id: r.id, track: r.track!, requestId: r.id, startedAt: r.playedAt!.toISOString(), endedAt: null }));
    if (perf.nowPlaying && !played.some((p) => sameSong(p.track, perf.nowPlaying!.track))) {
      played.push({ id: 'now', track: perf.nowPlaying.track, requestId: perf.nowPlaying.requestId ?? null, startedAt: perf.nowPlaying.startedAt, endedAt: null });
    }
    rows = [];
  }
  const reqIds = played.map((p) => p.requestId).filter((x): x is string => !!x);
  const owners = reqIds.length ? await db.select({ id: requests.id, userId: requests.userId }).from(requests).where(inArray(requests.id, reqIds)) : [];
  const ownerOf = new Map(owners.map((o) => [o.id, o.userId]));

  const queued = await db
    .select({ r: requests, votes: score })
    .from(requests)
    .where(and(eq(requests.performanceId, perf.id), eq(requests.status, 'QUEUED'), eq(requests.kind, 'SONG')))
    .orderBy(desc(score), asc(requests.decidedAt))
    .limit(30);
  const who = await people(db, [...owners.map((o) => o.userId), ...queued.map((q) => q.r.userId)]);

  return {
    live: perfStatus(perf) === 'LIVE',
    nowPlaying: perf.nowPlaying ?? null,
    played: played.map((p) => ({ ...p, requestedBy: p.requestId ? (who.get(ownerOf.get(p.requestId) ?? '') ?? null) : null })),
    upNext: queued.filter((q) => q.r.track).map((q) => ({ requestId: q.r.id, track: q.r.track!, votes: Number(q.votes ?? 0), requestedBy: who.get(q.r.userId) ?? null })),
  };
}
