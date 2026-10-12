/**
 * PASS THE AUX: private listening sessions (at home, in the car, at a braai) where friends join with
 * an invite and build the queue together. Sessions reuse the performances table with kind = 'HOME'
 * and no artist or venue, so they never show up in public discovery.
 */
import { and, asc, count, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { DB } from '../../db';
import { friendships, performanceLikes, performances, posts, requests, sessionMembers, users } from '../../db/schema';
import type {
  HomeSessionDTO,
  HomeSettings,
  PerformanceBrief,
  PublicControls,
  RoomDTO,
  SessionSummary,
  SessionVisibility,
  Track,
  VenueDTO,
} from '../../types';
import { newId } from '../crypto';
import { HttpError, bad, forbidden, notFound, unauthorized } from '../http';
import type { AuthedUser } from '../session';
import { perfStatus, postDTOs, recentPosts, requestDTOs, userBrief, type PerformanceRow, type UserRow } from './core';
import { checkSongClash } from './songClash';

export const DEFAULT_HOME: HomeSettings = { approval: 'AUTO', perGuestLimit: 3, source: null };
const ACTIVE = ['PENDING', 'QUEUED', 'PLAYING'] as const;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** What guests see as the session's "controls": free, songs up to 15 minutes, no On The Mic. */
export const HOME_CONTROLS: PublicControls = {
  requestIntake: 100,
  maxSongLength: 15,
  ratePerMinShort: 0,
  ratePerMinLong: 0,
  mic: 'NO',
  micPrice: 0,
  leadTime: 'LIVE',
  genres: [],
};

export function newJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export async function getPerformance(db: DB, id: string): Promise<PerformanceRow | null> {
  return (await db.select().from(performances).where(eq(performances.id, id)).limit(1))[0] ?? null;
}

export function settingsOf(p: PerformanceRow): HomeSettings {
  return { ...DEFAULT_HOME, ...(p.homeSettings ?? {}) };
}

async function areFriends(db: DB, a: string, b: string) {
  const r = await db
    .select({ s: friendships.status })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, 'ACCEPTED'),
        or(and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)), and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a))),
      ),
    )
    .limit(1);
  return !!r[0];
}

export async function memberRole(db: DB, performanceId: string, userId: string) {
  const r = await db
    .select({ role: sessionMembers.role })
    .from(sessionMembers)
    .where(and(eq(sessionMembers.performanceId, performanceId), eq(sessionMembers.userId, userId)))
    .limit(1);
  return r[0]?.role ?? null;
}

/**
 * Can this person see / join the session? Members always can. FRIENDS sessions let the host's
 * friends in automatically; PUBLIC ones let anyone with the link in; PRIVATE needs the code.
 */
export async function sessionAccess(db: DB, p: PerformanceRow, viewer: AuthedUser | null) {
  if (!viewer) return { allowed: false, member: false, host: false, canAutoJoin: false };
  const host = p.hostUserId === viewer.id;
  const role = await memberRole(db, p.id, viewer.id);
  if (host || role) return { allowed: true, member: true, host, canAutoJoin: false };
  if (viewer.role === 'ADMIN') return { allowed: true, member: false, host: false, canAutoJoin: false };
  if (p.visibility === 'PUBLIC') return { allowed: true, member: false, host: false, canAutoJoin: true };
  if (p.visibility === 'FRIENDS' && p.hostUserId && (await areFriends(db, p.hostUserId, viewer.id))) {
    return { allowed: true, member: false, host: false, canAutoJoin: true };
  }
  return { allowed: false, member: false, host: false, canAutoJoin: false };
}

/** Throws unless the user is in the session (joining automatically where the session allows it). */
export async function requireSessionMember(db: DB, p: PerformanceRow, user: AuthedUser) {
  const a = await sessionAccess(db, p, user);
  if (!a.allowed) throw new HttpError(403, 'This is a private PASS THE AUX session. Ask the host for the invite code.', 'PRIVATE_SESSION');
  if (!a.member && a.canAutoJoin) await addMember(db, p.id, user.id, 'GUEST');
  return a;
}

async function addMember(db: DB, performanceId: string, userId: string, role: 'HOST' | 'GUEST') {
  await db.insert(sessionMembers).values({ performanceId, userId, role }).onConflictDoNothing();
}

async function hostOf(db: DB, p: PerformanceRow): Promise<UserRow> {
  const u = p.hostUserId ? (await db.select().from(users).where(eq(users.id, p.hostUserId)).limit(1))[0] : undefined;
  if (!u) throw notFound('This session has ended.');
  return u;
}

async function membersOf(db: DB, performanceId: string) {
  const rows = await db
    .select({ u: users, role: sessionMembers.role })
    .from(sessionMembers)
    .innerJoin(users, eq(users.id, sessionMembers.userId))
    .where(eq(sessionMembers.performanceId, performanceId))
    .orderBy(asc(sessionMembers.joinedAt));
  return rows;
}

function homeVenue(p: PerformanceRow, host: UserRow, members: number): VenueDTO {
  return {
    id: `home-${p.id}`,
    ownerId: host.id,
    name: p.title,
    kind: 'LOUNGE',
    city: '',
    address: '',
    lat: 0,
    lng: 0,
    imageUrl: p.imageUrl,
    logoStyle: 'wide',
    description: settingsOf(p).source ? `Playing from ${settingsOf(p).source}` : '',
    chatLabel: 'SESSION CHAT',
    managementLabel: `Hosted by ${host.userName}`,
    capacity: members,
    liveCapacity: members,
    avgWeek: 0,
    avgMonth: 0,
    waitMinutes: null,
    artistSharePct: 0,
    safetyPhone: null,
    musicGenres: [],
  };
}

async function homeBrief(db: DB, p: PerformanceRow, host: UserRow, viewerId: string | null, members: number): Promise<PerformanceBrief> {
  const [likes, mine, reqs] = await Promise.all([
    db.select({ n: count() }).from(performanceLikes).where(eq(performanceLikes.performanceId, p.id)),
    viewerId
      ? db.select({ id: performanceLikes.performanceId }).from(performanceLikes).where(and(eq(performanceLikes.performanceId, p.id), eq(performanceLikes.userId, viewerId)))
      : Promise.resolve([]),
    db.select({ n: count() }).from(requests).where(and(eq(requests.performanceId, p.id), sql`${requests.status} <> 'REJECTED'`)),
  ]);
  return {
    id: p.id,
    kind: 'HOME',
    title: p.title,
    status: perfStatus(p),
    startsAt: p.startsAt.toISOString(),
    endsAt: p.endsAt.toISOString(),
    basis: p.basis,
    crowdEstimate: members,
    imageUrl: p.imageUrl,
    caption: p.caption,
    eventId: null,
    stageId: null,
    performer: { id: host.id, name: host.userName, imageUrl: host.avatarUrl, type: 'DJ', userId: host.id },
    venue: { id: `home-${p.id}`, name: p.title, city: '', imageUrl: p.imageUrl, logoStyle: 'wide', kind: 'LOUNGE' },
    nowPlaying: p.nowPlaying ?? null,
    likes: p.likesBase + Number(likes[0]?.n ?? 0),
    liked: mine.length > 0,
    reposts: p.reposts,
    requestCount: Number(reqs[0]?.n ?? 0),
  };
}

/** Room payload for a PASS THE AUX session. `perf` has already had its playback advanced. */
export async function loadHomeRoom(db: DB, perf: PerformanceRow, viewer: AuthedUser | null): Promise<RoomDTO> {
  if (!viewer) throw unauthorized('Log in to join this PASS THE AUX session.');
  const access = await requireSessionMember(db, perf, viewer);
  const host = await hostOf(db, perf);
  const members = await membersOf(db, perf.id);
  const queueRows = await db
    .select()
    .from(requests)
    .where(and(eq(requests.performanceId, perf.id), inArray(requests.status, [...ACTIVE])))
    .orderBy(asc(requests.createdAt));
  const queue = await requestDTOs(db, queueRows, viewer.id);
  const order = { PLAYING: 0, QUEUED: 1, PENDING: 2 } as Record<string, number>;
  queue.sort((a, b) => order[a.status] - order[b.status] || b.up - b.down - (a.up - a.down) || a.createdAt.localeCompare(b.createdAt));
  const played = await db
    .select()
    .from(requests)
    .where(and(eq(requests.performanceId, perf.id), eq(requests.status, 'PLAYED')))
    .orderBy(desc(requests.playedAt))
    .limit(8);
  queue.push(...(await requestDTOs(db, played, viewer.id)));
  const postList = (await postDTOs(db, await recentPosts(db, perf.id, 40), viewer.id)).reverse();
  const s = settingsOf(perf);
  const isHost = perf.hostUserId === viewer.id;
  const mineActive = queueRows.filter((r) => r.userId === viewer.id && r.status !== 'PLAYING').length;
  const status = perfStatus(perf);
  const canRequest =
    status === 'ENDED'
      ? { ok: false, reason: 'This session has ended.' }
      : !isHost && mineActive >= s.perGuestLimit
        ? { ok: false, reason: `You've got ${mineActive} song${mineActive === 1 ? '' : 's'} waiting — let them play first.` }
        : { ok: true };
  const session: HomeSessionDTO = {
    host: userBrief(host),
    visibility: perf.visibility,
    settings: s,
    joinCode: access.member || isHost ? perf.joinCode : null,
    members: members.map((m) => userBrief(m.u)),
    memberCount: members.length,
    isHost,
    isMember: true,
  };
  return {
    performance: await homeBrief(db, perf, host, viewer.id, members.length),
    venue: homeVenue(perf, host, members.length),
    controls: HOME_CONTROLS,
    queue,
    posts: postList,
    openSlots: 100,
    canRequest,
    isPerformer: isHost,
    isOwner: false,
    session,
    playback: isHost ? perf.playback ?? null : null,
  };
}

/** Adds a song to a session queue. Free; auto-queued unless the host approves each one. */
export async function createHomeRequest(db: DB, user: AuthedUser, perf: PerformanceRow, track: Track | null) {
  await requireSessionMember(db, perf, user);
  if (perfStatus(perf) === 'ENDED') throw new HttpError(409, 'This session has ended.', 'CLOSED');
  if (!track) throw bad('Pick a song to add.');
  const s = settingsOf(perf);
  const isHost = perf.hostUserId === user.id;
  if (!isHost) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(requests)
      .where(and(eq(requests.performanceId, perf.id), eq(requests.userId, user.id), inArray(requests.status, ['PENDING', 'QUEUED'])));
    if (Number(n) >= s.perGuestLimit) throw new HttpError(409, `You can have ${s.perGuestLimit} songs waiting at a time.`, 'CLOSED');
  }
  // Friends at home can replay a favourite; only waiting duplicates and the song on now are caught.
  await checkSongClash(db, perf, track, { blockReplays: false, duplicateMessage: "That one's already in the queue — upvote it instead!" });
  const auto = isHost || s.approval === 'AUTO';
  const id = newId();
  await db.insert(requests).values({
    id,
    performanceId: perf.id,
    userId: user.id,
    kind: 'SONG',
    track,
    message: null,
    priceCents: 0,
    status: auto ? 'QUEUED' : 'PENDING',
    decidedAt: auto ? new Date() : null,
  });
  return { id, priceCents: 0 };
}

export async function createSession(
  db: DB,
  user: AuthedUser,
  input: { title: string; visibility: SessionVisibility; settings: HomeSettings; imageUrl: string | null },
) {
  const live = await db
    .select({ id: performances.id })
    .from(performances)
    .where(and(eq(performances.kind, 'HOME'), eq(performances.hostUserId, user.id), sql`${performances.endedAt} is null`, sql`${performances.endsAt} > now()`));
  if (live.length >= 3) throw bad('You already have 3 sessions running. End one first.');
  const id = newId();
  const now = new Date();
  let code = newJoinCode();
  for (let i = 0; i < 4; i++) {
    const clash = await db.select({ id: performances.id }).from(performances).where(eq(performances.joinCode, code)).limit(1);
    if (!clash[0]) break;
    code = newJoinCode();
  }
  await db.transaction(async (tx) => {
    await tx.insert(performances).values({
      id,
      kind: 'HOME',
      hostUserId: user.id,
      visibility: input.visibility,
      joinCode: code,
      homeSettings: input.settings,
      title: input.title,
      startsAt: now,
      endsAt: new Date(now.getTime() + 12 * 3600_000),
      wentLiveAt: now,
      imageUrl: input.imageUrl,
      crowdEstimate: 1,
      createdById: user.id,
    });
    await tx.insert(sessionMembers).values({ performanceId: id, userId: user.id, role: 'HOST' });
  });
  return { id, joinCode: code };
}

export async function joinByCode(db: DB, user: AuthedUser, code: string) {
  const p = (
    await db
      .select()
      .from(performances)
      .where(and(eq(performances.kind, 'HOME'), eq(performances.joinCode, code.trim().toUpperCase())))
      .limit(1)
  )[0];
  if (!p) throw notFound("That code doesn't match a session. Check it with the host.");
  if (perfStatus(p) === 'ENDED') throw bad('That session has ended.');
  await addMember(db, p.id, user.id, p.hostUserId === user.id ? 'HOST' : 'GUEST');
  return { id: p.id };
}

export async function requireHost(db: DB, id: string, user: AuthedUser) {
  const p = await getPerformance(db, id);
  if (!p || p.kind !== 'HOME') throw notFound('Session not found.');
  if (p.hostUserId !== user.id && user.role !== 'ADMIN') throw forbidden('Only the host can do that.');
  return p;
}

export async function leaveSession(db: DB, user: AuthedUser, id: string) {
  const p = await getPerformance(db, id);
  if (!p || p.kind !== 'HOME') throw notFound('Session not found.');
  if (p.hostUserId === user.id) throw bad('You host this session — end it instead.');
  await db.delete(sessionMembers).where(and(eq(sessionMembers.performanceId, id), eq(sessionMembers.userId, user.id)));
  return { ok: true };
}

export async function removeMember(db: DB, user: AuthedUser, id: string, memberId: string) {
  const p = await requireHost(db, id, user);
  if (memberId === p.hostUserId) throw bad("You can't remove yourself.");
  await db.delete(sessionMembers).where(and(eq(sessionMembers.performanceId, id), eq(sessionMembers.userId, memberId)));
  await db
    .update(requests)
    .set({ status: 'REJECTED', decidedAt: new Date() })
    .where(and(eq(requests.performanceId, id), eq(requests.userId, memberId), inArray(requests.status, ['PENDING', 'QUEUED'])));
  return { ok: true };
}

/** Share a session to the Wire Room as a card (optionally opening it to friends or everyone). */
export async function shareSession(db: DB, user: AuthedUser, id: string, text: string, visibility?: SessionVisibility) {
  const p = await requireHost(db, id, user);
  if (visibility && visibility !== p.visibility) await db.update(performances).set({ visibility }).where(eq(performances.id, id));
  const postId = newId();
  await db.insert(posts).values({
    id: postId,
    authorId: user.id,
    kind: 'CHAT',
    performanceId: null,
    text: text || `Come through — I'm passing the aux in "${p.title}" 🎶`,
    nowPlaying: p.nowPlaying?.track.title ?? null,
    attachment: { type: 'session', performanceId: id },
  });
  return { id: postId };
}

/** Sessions you host or have joined (live first). */
export async function mySessions(db: DB, userId: string): Promise<SessionSummary[]> {
  const rows = await db
    .select({ p: performances, role: sessionMembers.role })
    .from(sessionMembers)
    .innerJoin(performances, eq(performances.id, sessionMembers.performanceId))
    .where(and(eq(sessionMembers.userId, userId), eq(performances.kind, 'HOME')))
    .orderBy(desc(performances.startsAt))
    .limit(30);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.p.id);
  const hostIds = Array.from(new Set(rows.map((r) => r.p.hostUserId).filter(Boolean) as string[]));
  const [hosts, counts, queued] = await Promise.all([
    db.select().from(users).where(inArray(users.id, hostIds)),
    db.select({ id: sessionMembers.performanceId, n: count() }).from(sessionMembers).where(inArray(sessionMembers.performanceId, ids)).groupBy(sessionMembers.performanceId),
    db
      .select({ id: requests.performanceId, n: count() })
      .from(requests)
      .where(and(inArray(requests.performanceId, ids), inArray(requests.status, ['PENDING', 'QUEUED'])))
      .groupBy(requests.performanceId),
  ]);
  const hostMap = new Map(hosts.map((h) => [h.id, h]));
  const countMap = new Map(counts.map((c) => [c.id, Number(c.n)]));
  const queuedMap = new Map(queued.map((c) => [c.id, Number(c.n)]));
  return rows
    .filter((r) => hostMap.has(r.p.hostUserId ?? ''))
    .map(({ p }) => ({
      id: p.id,
      title: p.title,
      status: perfStatus(p),
      host: userBrief(hostMap.get(p.hostUserId!)!),
      visibility: p.visibility,
      memberCount: countMap.get(p.id) ?? 1,
      queued: queuedMap.get(p.id) ?? 0,
      nowPlaying: p.nowPlaying ?? null,
      isHost: p.hostUserId === userId,
      startsAt: p.startsAt.toISOString(),
    }))
    .sort((a, b) => Number(b.status === 'LIVE') - Number(a.status === 'LIVE') || b.startsAt.localeCompare(a.startsAt));
}
