import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { REACTIONS } from '../../reactions';
import { sampleCrowdTick } from '../../db/sampleCrowd';
import type { DB } from '../../db';
import { earnings, performances, posts, requestReactions, requests, requestVotes, venues } from '../../db/schema';
import { blockedWord, exceedsMaxLength, requestPriceCents } from '../../pricing';
import type { CanRequest, NowPlaying, RoomDTO, Track } from '../../types';
import { newId } from '../crypto';
import { HttpError, bad, forbidden, notFound } from '../http';
import type { AuthedUser } from '../session';
import {
  DEFAULT_CONTROLS,
  loadPerformance,
  perfStatus,
  performanceBriefs,
  postDTOs,
  publicControls,
  recentPosts,
  requestDTOs,
  venueDTO,
  type PerformanceRow,
  type PerformerRow,
  type VenueRow,
} from './core';
import { credit, debit } from './wallet';
import { createHomeRequest, getPerformance, loadHomeRoom, requireSessionMember } from './sessions';
import { checkSpendCap } from './nightOut';
import { syncExternal } from './playback';
import { checkSongClash } from './songClash';
import { notifyNowPlaying, notifyUser } from '../push';

/** Artists can open a set for requests up to this long before its slot. */
const GO_LIVE_EARLY_MS = 2 * 3600_000;

export { REACTIONS };
const ACTIVE: ('PENDING' | 'QUEUED' | 'PLAYING')[] = ['PENDING', 'QUEUED', 'PLAYING'];
const MIC_SECONDS = 30;

function micTrack(message: string, by: string): Track {
  return { title: `"${message}"`, artist: `On The Mic · ${by}`, durationSec: MIC_SECONDS, source: 'catalog' };
}

function endOf(np: NowPlaying): number {
  return new Date(np.startedAt).getTime() + np.track.durationSec * 1000;
}

/**
 * Advances "now playing" for a live set: when the current track has run its length the next
 * approved request (highest net votes first) plays, otherwise the next track of the artist's own
 * set. Artists can override with play-now / skip from their dashboard.
 */
export async function advancePlayback(db: DB, perf: PerformanceRow): Promise<PerformanceRow> {
  // Real playback (Spotify / AUXED Player) drives "now playing" instead of the simulation.
  if (perf.playback) return perf;
  if (perfStatus(perf) !== 'LIVE') return perf;
  let np = perf.nowPlaying ?? null;
  let cursor = perf.setCursor;
  const now = Date.now();
  if (np && now < endOf(np)) return perf;
  let changed = false;
  for (let i = 0; i < 25; i++) {
    if (np && now < endOf(np)) break;
    const startAt = np ? endOf(np) : now;
    if (np?.requestId) {
      await db
        .update(requests)
        .set({ status: 'PLAYED', playedAt: new Date(np.startedAt) })
        .where(and(eq(requests.id, np.requestId), eq(requests.status, 'PLAYING')));
    }
    const next = await nextQueued(db, perf.id);
    if (next) {
      await db.update(requests).set({ status: 'PLAYING' }).where(eq(requests.id, next.id));
      np = { track: next.track ?? micTrack(next.message ?? '', 'Auxee'), startedAt: new Date(startAt).toISOString(), requestId: next.id };
    } else if (perf.setlist.length) {
      np = { track: perf.setlist[cursor % perf.setlist.length], startedAt: new Date(startAt).toISOString() };
      cursor += 1;
    } else {
      np = null;
    }
    changed = true;
    if (!np) break;
  }
  // Long idle gap (nobody looked at the room for hours): resume from now instead of replaying history.
  if (np && now >= endOf(np)) np = { ...np, startedAt: new Date(now).toISOString() };
  if (!changed) return perf;
  const [updated] = await db
    .update(performances)
    .set({ nowPlaying: np, setCursor: cursor })
    .where(eq(performances.id, perf.id))
    .returning();
  if (np && np.track.title !== perf.nowPlaying?.track.title) {
    const venueName = perf.venueId ? (await db.select({ n: venues.name }).from(venues).where(eq(venues.id, perf.venueId)).limit(1))[0]?.n ?? perf.title : perf.title;
    notifyNowPlaying(db, perf.id, venueName, np);
    if (np.requestId) {
      const r = (await db.select({ userId: requests.userId }).from(requests).where(eq(requests.id, np.requestId)).limit(1))[0];
      if (r) notifyUser(db, r.userId, { title: 'Your request is playing 🎉', body: `${np.track.title} — ${np.track.artist}`, tag: `req-${np.requestId}`, url: `/sets/${perf.id}` });
    }
  }
  return updated;
}

async function nextQueued(db: DB, performanceId: string) {
  const score = sql`${requests.baseUp} - ${requests.baseDown} + coalesce((select sum(${requestVotes.value}) from ${requestVotes} where ${requestVotes.requestId} = ${requests.id}), 0)`;
  const rows = await db
    .select()
    .from(requests)
    .where(and(eq(requests.performanceId, performanceId), eq(requests.status, 'QUEUED')))
    .orderBy(desc(score), asc(requests.decidedAt))
    .limit(1);
  return rows[0] ?? null;
}

export function canRequest(perf: PerformanceRow, performer: PerformerRow, user: AuthedUser | null, activeCount: number): CanRequest {
  const status = perfStatus(perf);
  const c = performer.controls ?? DEFAULT_CONTROLS;
  if (status === 'ENDED') return { ok: false, reason: 'This set has ended.' };
  if (status === 'UPCOMING') {
    if (c.leadTime === 'LIVE') return { ok: false, reason: 'Requests open when the set goes live.' };
    const hoursAway = (perf.startsAt.getTime() - Date.now()) / 3600_000;
    if (hoursAway > Number(c.leadTime)) return { ok: false, reason: `Requests open ${c.leadTime} hrs before the set.` };
  }
  if (activeCount >= c.requestIntake) return { ok: false, reason: 'All request slots are taken right now. Upvote a request instead!' };
  if (user && performer.userId === user.id) return { ok: false, reason: "You can't request into your own set." };
  return { ok: true };
}

export async function loadRoom(db: DB, performanceId: string, viewer: AuthedUser | null): Promise<RoomDTO> {
  const raw = await getPerformance(db, performanceId);
  if (raw?.kind === 'HOME') return loadHomeRoom(db, await syncExternal(db, await advancePlayback(db, raw)), viewer);
  const row = await loadPerformance(db, performanceId);
  if (!row) throw notFound('That set could not be found.');
  await sampleCrowdTick(db, row.p);
  const perf = await syncExternal(db, await advancePlayback(db, row.p));
  const [brief] = await performanceBriefs(db, eq(performances.id, perf.id), viewer?.id ?? null);
  const queueRows = await db
    .select()
    .from(requests)
    .where(and(eq(requests.performanceId, perf.id), inArray(requests.status, ['PENDING', 'QUEUED', 'PLAYING'])))
    .orderBy(asc(requests.createdAt));
  const queue = await requestDTOs(db, queueRows, viewer?.id ?? null);
  const order = { PLAYING: 0, QUEUED: 1, PENDING: 2 } as Record<string, number>;
  queue.sort((a, b) => order[a.status] - order[b.status] || b.up - b.down - (a.up - a.down) || a.createdAt.localeCompare(b.createdAt));
  // The last few played requests stay visible under the live queue.
  const playedRows = await db
    .select()
    .from(requests)
    .where(and(eq(requests.performanceId, perf.id), eq(requests.status, 'PLAYED')))
    .orderBy(desc(requests.playedAt))
    .limit(6);
  queue.push(...(await requestDTOs(db, playedRows, viewer?.id ?? null)));
  const postRows = await recentPosts(db, perf.id, 30);
  const postList = (await postDTOs(db, postRows, viewer?.id ?? null)).reverse();
  const controls = row.pf.controls ?? DEFAULT_CONTROLS;
  const active = queueRows.length;
  return {
    performance: brief,
    venue: venueDTO(row.v),
    controls: publicControls(controls),
    queue,
    posts: postList,
    openSlots: Math.max(0, controls.requestIntake - active),
    canRequest: canRequest(perf, row.pf, viewer, active),
    isPerformer: !!viewer && row.pf.userId === viewer.id,
    isOwner: !!viewer && row.v.ownerId === viewer.id,
    session: null,
    playback: viewer && (row.pf.userId === viewer.id || row.v.ownerId === viewer.id) ? perf.playback ?? null : null,
  };
}

export async function createRequest(
  db: DB,
  user: AuthedUser,
  performanceId: string,
  input: { kind: 'SONG' | 'MIC'; track: Track | null; message: string },
) {
  const raw = await getPerformance(db, performanceId);
  if (raw?.kind === 'HOME') {
    if (input.kind !== 'SONG') throw bad('PASS THE AUX sessions take songs only.');
    return createHomeRequest(db, user, raw, input.track);
  }
  const row = await loadPerformance(db, performanceId);
  if (!row) throw notFound('That set could not be found.');
  const { p: perf, pf: performer } = row;
  const c = performer.controls ?? DEFAULT_CONTROLS;
  const [{ n }] = await db
    .select({ n: count() })
    .from(requests)
    .where(and(eq(requests.performanceId, perf.id), inArray(requests.status, ACTIVE)));
  const gate = canRequest(perf, performer, user, Number(n));
  if (!gate.ok) throw new HttpError(409, gate.reason ?? 'Requests are closed.', 'CLOSED');

  if (input.kind === 'SONG') {
    if (!input.track) throw bad('Pick a song to request.');
    if (exceedsMaxLength(input.track, c)) throw bad(`This artist accepts songs up to ${c.maxSongLength} minutes long.`);
    await checkSongClash(db, perf, input.track, { blockReplays: true, duplicateMessage: 'Someone already requested this one — upvote it to move it up the queue!' });
  } else {
    if (c.mic === 'NO') throw bad("This artist isn't taking On The Mic requests.");
    if (!input.message) throw bad('Write the message you want read out.');
    const blocked = blockedWord(input.message, c.micFilters);
    if (blocked) throw bad('That message contains words this artist has filtered out.');
    if (c.mic !== 'YES_PLUS') input.track = null;
  }

  const priceCents = requestPriceCents(input.kind, input.track, c);
  await checkSpendCap(db, user, priceCents);
  const id = newId();
  await db.transaction(async (tx) => {
    const label = input.kind === 'SONG' ? `${input.track!.title} — ${input.track!.artist}` : 'On The Mic';
    await debit(tx, user.id, priceCents, `Request: ${label}`, id);
    await tx.insert(requests).values({
      id,
      performanceId: perf.id,
      userId: user.id,
      kind: input.kind,
      track: input.track,
      message: input.message || null,
      priceCents,
      status: 'PENDING',
    });
  });
  return { id, priceCents };
}

async function requireManager(db: DB, user: AuthedUser, requestId: string) {
  const rows = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  const req = rows[0];
  if (!req) throw notFound('Request not found.');
  const raw = await getPerformance(db, req.performanceId);
  if (!raw) throw notFound();
  if (raw.kind === 'HOME') {
    if (raw.hostUserId !== user.id && user.role !== 'ADMIN') throw forbidden('Only the host can manage the queue.');
    return { req, perf: raw, performer: null as PerformerRow | null, venue: null as VenueRow | null };
  }
  const row = await loadPerformance(db, req.performanceId);
  if (!row) throw notFound();
  const allowed = row.pf.userId === user.id || row.v.ownerId === user.id || user.role === 'ADMIN';
  if (!allowed) throw forbidden('Only the artist or venue can manage this request.');
  return { req, perf: row.p, performer: row.pf as PerformerRow | null, venue: row.v as VenueRow | null };
}

function split(priceCents: number, venue: VenueRow) {
  const performer = Math.round((priceCents * venue.artistSharePct) / 100);
  return { performer, venue: priceCents - performer };
}

export async function decideRequest(db: DB, user: AuthedUser, requestId: string, action: 'approve' | 'reject' | 'play') {
  const { req, perf, performer, venue } = await requireManager(db, user, requestId);
  if (action === 'reject') {
    if (req.status !== 'PENDING') throw bad('Only pending requests can be declined.');
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(requests)
        .set({ status: 'REJECTED', decidedAt: new Date() })
        .where(and(eq(requests.id, req.id), eq(requests.status, 'PENDING')))
        .returning({ id: requests.id });
      if (!updated.length || req.priceCents <= 0) return;
      await credit(tx, req.userId, req.priceCents, 'REFUND', 'Request declined by the artist — refunded', { requestId: req.id });
    });
    return { status: 'REJECTED' };
  }
  if (req.status === 'PENDING') {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(requests)
        .set({ status: 'QUEUED', decidedAt: new Date() })
        .where(and(eq(requests.id, req.id), eq(requests.status, 'PENDING')))
        .returning({ id: requests.id });
      if (!updated.length || !venue || !performer || req.priceCents <= 0) return;
      const s = split(req.priceCents, venue);
      await tx.insert(earnings).values([
        { id: newId(), requestId: req.id, beneficiaryType: 'PERFORMER', beneficiaryId: performer.id, amountCents: s.performer },
        { id: newId(), requestId: req.id, beneficiaryType: 'VENUE', beneficiaryId: venue.id, amountCents: s.venue },
      ]);
    });
  }
  if (action === 'play') {
    if (perfStatus(perf) !== 'LIVE') throw bad('Go live before playing requests.');
    const current = perf.nowPlaying;
    if (current?.requestId && current.requestId !== req.id) {
      await db.update(requests).set({ status: 'PLAYED', playedAt: new Date(current.startedAt) }).where(eq(requests.id, current.requestId));
    }
    await db.update(requests).set({ status: 'PLAYING' }).where(eq(requests.id, req.id));
    const fresh = (await db.select().from(requests).where(eq(requests.id, req.id)))[0];
    await db
      .update(performances)
      .set({
        nowPlaying: {
          track: fresh.track ?? micTrack(fresh.message ?? '', 'Auxee'),
          startedAt: new Date().toISOString(),
          requestId: fresh.id,
        },
      })
      .where(eq(performances.id, perf.id));
    return { status: 'PLAYING' };
  }
  return { status: 'QUEUED' };
}

export async function controlPerformance(db: DB, user: AuthedUser, performanceId: string, action: 'golive' | 'end' | 'skip') {
  const raw = await getPerformance(db, performanceId);
  if (!raw) throw notFound();
  let allowed = user.role === 'ADMIN';
  if (raw.kind === 'HOME') allowed ||= raw.hostUserId === user.id;
  else {
    const row = await loadPerformance(db, performanceId);
    if (!row) throw notFound();
    allowed ||= row.pf.userId === user.id || row.v.ownerId === user.id;
  }
  if (!allowed) throw forbidden();
  const perf = raw;
  if (action === 'golive') {
    if (perf.endedAt) throw bad('This set has already ended.');
    if (perfStatus(perf) === 'ENDED') throw bad('This slot is over. Create a new set to go live again.');
    if (perf.kind !== 'HOME' && perf.startsAt.getTime() - Date.now() > GO_LIVE_EARLY_MS) {
      throw bad("This set hasn't started yet. You can go live from 2 hours before its start time.");
    }
    await db.update(performances).set({ wentLiveAt: new Date() }).where(eq(performances.id, perf.id));
    return { ok: true };
  }
  if (action === 'skip') {
    const np = perf.nowPlaying;
    if (np) {
      if (np.requestId) await db.update(requests).set({ status: 'PLAYED', playedAt: new Date(np.startedAt) }).where(eq(requests.id, np.requestId));
      await db
        .update(performances)
        .set({ nowPlaying: { ...np, startedAt: new Date(Date.now() - np.track.durationSec * 1000 - 1).toISOString(), requestId: undefined } })
        .where(eq(performances.id, perf.id));
    }
    const fresh = (await db.select().from(performances).where(eq(performances.id, perf.id)))[0];
    await advancePlayback(db, fresh);
    return { ok: true };
  }
  await closePerformance(db, perf.id);
  return { ok: true };
}

/** End a set: refund anything the artist never got to and reverse its earnings. Used by "End set" and by housekeeping. */
export async function closePerformance(db: DB, performanceId: string) {
  await db.transaction(async (tx) => {
    await tx.update(performances).set({ endedAt: new Date(), nowPlaying: null }).where(eq(performances.id, performanceId));
    const pending = await tx
      .update(requests)
      .set({ status: 'REJECTED', decidedAt: new Date() })
      .where(and(eq(requests.performanceId, performanceId), eq(requests.status, 'PENDING')))
      .returning();
    for (const r of pending) {
      if (r.priceCents > 0) await credit(tx, r.userId, r.priceCents, 'REFUND', 'Set ended before your request was accepted — refunded', { requestId: r.id });
    }
    // Accepted but never played: refund the AUXee and reverse the artist/venue earnings booked on accept.
    const unplayed = await tx
      .update(requests)
      .set({ status: 'REJECTED', decidedAt: new Date() })
      .where(and(eq(requests.performanceId, performanceId), eq(requests.status, 'QUEUED')))
      .returning();
    if (unplayed.length) {
      await tx.delete(earnings).where(inArray(earnings.requestId, unplayed.map((r) => r.id)));
      for (const r of unplayed) {
        if (r.priceCents > 0) await credit(tx, r.userId, r.priceCents, 'REFUND', 'Set ended before your request played — refunded', { requestId: r.id });
      }
    }
    await tx
      .update(requests)
      .set({ status: 'PLAYED', playedAt: new Date() })
      .where(and(eq(requests.performanceId, performanceId), eq(requests.status, 'PLAYING')));
  });
}

/** Private PASS THE AUX sessions are members-only; public sets are open to everyone signed in. */
export async function requireRoomAccess(db: DB, performanceId: string, user: AuthedUser | null) {
  const raw = await getPerformance(db, performanceId);
  if (!raw) throw notFound('That set could not be found.');
  if (raw.kind === 'HOME') {
    if (!user) throw new HttpError(401, 'Log in to see this session.', 'UNAUTHORIZED');
    await requireSessionMember(db, raw, user);
  }
  return raw;
}

export async function voteRequest(db: DB, user: AuthedUser, requestId: string, value: 1 | -1) {
  const rows = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  const req = rows[0];
  if (!req) throw notFound('Request not found.');
  await requireRoomAccess(db, req.performanceId, user);
  if (req.userId === user.id) throw bad("You can't vote on your own request.");
  if (req.status === 'REJECTED' || req.status === 'PLAYED') throw bad('Voting has closed on this request.');
  const existing = await db
    .select()
    .from(requestVotes)
    .where(and(eq(requestVotes.requestId, requestId), eq(requestVotes.userId, user.id)))
    .limit(1);
  if (existing[0]?.value === value) {
    await db.delete(requestVotes).where(and(eq(requestVotes.requestId, requestId), eq(requestVotes.userId, user.id)));
    return { myVote: 0 };
  }
  await db
    .insert(requestVotes)
    .values({ requestId, userId: user.id, value })
    .onConflictDoUpdate({ target: [requestVotes.requestId, requestVotes.userId], set: { value } });
  return { myVote: value };
}

export async function reactRequest(db: DB, user: AuthedUser, requestId: string, emoji: string) {
  if (!(REACTIONS as readonly string[]).includes(emoji)) throw bad('Unsupported reaction.');
  const exists = await db.select({ id: requests.id, performanceId: requests.performanceId }).from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!exists[0]) throw notFound('Request not found.');
  await requireRoomAccess(db, exists[0].performanceId, user);
  const where = and(eq(requestReactions.requestId, requestId), eq(requestReactions.userId, user.id), eq(requestReactions.emoji, emoji));
  const mine = await db.select().from(requestReactions).where(where).limit(1);
  if (mine[0]) {
    await db.delete(requestReactions).where(where);
    return { mine: false };
  }
  await db.insert(requestReactions).values({ requestId, userId: user.id, emoji });
  return { mine: true };
}

/** Section chat message inside a room (or the global Wire Room when performanceId is null). */
export async function createPost(
  db: DB,
  user: AuthedUser,
  input: { kind: 'CHAT' | 'MIC' | 'SNIPPET' | 'MANAGEMENT'; performanceId: string | null; text: string; caption?: string | null; imageUrl?: string | null; toUserId?: string | null; label?: string | null },
) {
  let nowPlaying: string | null = null;
  if (input.performanceId) {
    const raw = await getPerformance(db, input.performanceId);
    if (!raw) throw notFound('That set could not be found.');
    if (raw.kind === 'HOME') {
      if (input.kind === 'MANAGEMENT') throw forbidden();
      await requireSessionMember(db, raw, user);
    } else {
      const row = await loadPerformance(db, input.performanceId);
      if (!row) throw notFound('That set could not be found.');
      if (input.kind === 'MANAGEMENT' && row.v.ownerId !== user.id && user.role !== 'ADMIN') throw forbidden();
    }
    if (raw.nowPlaying) nowPlaying = `${raw.nowPlaying.track.title}`;
  } else {
    // Global feed: show what's playing where the author most recently requested.
    const last = await db
      .select({ np: performances.nowPlaying })
      .from(requests)
      .innerJoin(performances, eq(performances.id, requests.performanceId))
      .where(and(eq(requests.userId, user.id), eq(performances.kind, 'SET')))
      .orderBy(sql`${requests.createdAt} desc`)
      .limit(1);
    if (last[0]?.np) nowPlaying = last[0].np.track.title;
  }
  if (input.kind === 'MANAGEMENT' && user.role !== 'OWNER' && user.role !== 'ADMIN') throw forbidden();
  const id = newId();
  await db.insert(posts).values({
    id,
    authorId: user.id,
    kind: input.kind,
    performanceId: input.performanceId,
    text: input.text,
    caption: input.caption ?? null,
    imageUrl: input.imageUrl ?? null,
    nowPlaying,
    toUserId: input.toUserId ?? null,
    label: input.label ?? null,
  });
  return { id };
}

export async function venueOwnedBy(db: DB, venueId: string, userId: string) {
  const v = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  return v[0]?.ownerId === userId ? v[0] : null;
}
