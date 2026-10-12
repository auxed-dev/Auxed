import { and, count, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { DB } from '../../db';
import {
  events,
  friendships,
  sessionMembers,
  performanceLikes,
  performances,
  performers,
  postLikes,
  posts,
  requestReactions,
  requests,
  requestVotes,
  stages,
  users,
  venues,
} from '../../db/schema';
import type {
  CreativeControls,
  EventDTO,
  PerformanceBrief,
  PostAttachment,
  PerformanceStatus,
  PostDTO,
  PublicControls,
  RequestDTO,
  UserBrief,
  VenueDTO,
} from '../../types';

export type PerformanceRow = typeof performances.$inferSelect;
export type PerformerRow = typeof performers.$inferSelect;
export type VenueRow = typeof venues.$inferSelect;
export type RequestRow = typeof requests.$inferSelect;
export type UserRow = typeof users.$inferSelect;

export const DEFAULT_CONTROLS: CreativeControls = {
  requestIntake: 10,
  genres: [],
  maxSongLength: 7,
  ratePerMinShort: 3,
  ratePerMinLong: 2.5,
  micPrice: 15,
  mic: 'YES',
  micFilters: [],
  leadTime: 'LIVE',
  integrations: [],
};

/** A set may run over its slot, but one nobody ends closes itself this long after (see housekeeping.ts). */
export const SET_OVERRUN_MS = 3 * 3600_000;

export function perfStatus(
  p: Pick<PerformanceRow, 'wentLiveAt' | 'endedAt' | 'startsAt' | 'endsAt'> & { kind?: PerformanceRow['kind'] },
  now = new Date(),
): PerformanceStatus {
  if (p.endedAt) return 'ENDED';
  // PASS THE AUX sessions close by themselves when their window runs out.
  if (p.kind === 'HOME' && now >= p.endsAt) return 'ENDED';
  if (now.getTime() >= p.endsAt.getTime() + SET_OVERRUN_MS) return 'ENDED';
  if (p.wentLiveAt) return 'LIVE';
  if (p.startsAt <= now && now < p.endsAt) return 'LIVE';
  if (now >= p.endsAt) return 'ENDED';
  return 'UPCOMING';
}

/** SQL predicate equivalent of perfStatus() === 'LIVE'. */
export const liveWhere = () =>
  sql`(${performances.endedAt} is null and (${performances.kind} <> 'HOME' or now() < ${performances.endsAt}) and now() < ${performances.endsAt} + interval '3 hours' and (${performances.wentLiveAt} is not null or (${performances.startsAt} <= now() and now() < ${performances.endsAt})))`;

export function userBrief(u: Pick<UserRow, 'id' | 'userName' | 'avatarUrl' | 'ring' | 'role'>): UserBrief {
  return { id: u.id, userName: u.userName, avatarUrl: u.avatarUrl, ring: u.ring, role: u.role };
}

export function venueDTO(v: VenueRow): VenueDTO {
  return {
    id: v.id,
    ownerId: v.ownerId,
    name: v.name,
    kind: v.kind,
    city: v.city,
    address: v.address,
    lat: v.lat,
    lng: v.lng,
    imageUrl: v.imageUrl,
    logoStyle: v.logoStyle,
    description: v.description,
    chatLabel: v.chatLabel,
    managementLabel: v.managementLabel,
    capacity: v.capacity,
    liveCapacity: v.liveCapacity,
    avgWeek: v.avgWeek,
    avgMonth: v.avgMonth,
    waitMinutes: v.waitMinutes,
    artistSharePct: v.artistSharePct,
    safetyPhone: v.safetyPhone,
  };
}

export function publicControls(c: CreativeControls): PublicControls {
  return {
    requestIntake: c.requestIntake,
    maxSongLength: c.maxSongLength,
    ratePerMinShort: c.ratePerMinShort,
    ratePerMinLong: c.ratePerMinLong,
    mic: c.mic,
    micPrice: c.micPrice,
    leadTime: c.leadTime,
    genres: c.genres,
  };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Loads performance cards with performer, venue, likes and request counts. */
export async function performanceBriefs(
  db: DB,
  where: SQL | undefined,
  viewerId: string | null,
  opts: { limit?: number; orderBy?: 'startsAsc' | 'startsDesc' | 'likes' } = {},
): Promise<PerformanceBrief[]> {
  const order =
    opts.orderBy === 'startsDesc'
      ? desc(performances.startsAt)
      : opts.orderBy === 'likes'
        ? desc(performances.likesBase)
        : performances.startsAt;
  const q = db
    .select({ p: performances, pf: performers, v: venues })
    .from(performances)
    .innerJoin(performers, eq(performers.id, performances.performerId))
    .innerJoin(venues, eq(venues.id, performances.venueId))
    .where(where)
    .orderBy(order);
  const rows = opts.limit ? await q.limit(opts.limit) : await q;
  if (!rows.length) return [];
  const ids = rows.map((r) => r.p.id);
  const [likeCounts, mine, reqCounts] = await Promise.all([
    db
      .select({ id: performanceLikes.performanceId, n: count() })
      .from(performanceLikes)
      .where(inArray(performanceLikes.performanceId, ids))
      .groupBy(performanceLikes.performanceId),
    viewerId
      ? db
          .select({ id: performanceLikes.performanceId })
          .from(performanceLikes)
          .where(and(inArray(performanceLikes.performanceId, ids), eq(performanceLikes.userId, viewerId)))
      : Promise.resolve([] as { id: string }[]),
    db
      .select({ id: requests.performanceId, n: count() })
      .from(requests)
      .where(and(inArray(requests.performanceId, ids), sql`${requests.status} <> 'REJECTED'`))
      .groupBy(requests.performanceId),
  ]);
  const likeMap = new Map(likeCounts.map((l) => [l.id, Number(l.n)]));
  const mineSet = new Set(mine.map((m) => m.id));
  const reqMap = new Map(reqCounts.map((r) => [r.id, Number(r.n)]));
  return rows.map(({ p, pf, v }) => ({
    id: p.id,
    kind: p.kind,
    title: p.title,
    status: perfStatus(p),
    startsAt: p.startsAt.toISOString(),
    endsAt: p.endsAt.toISOString(),
    basis: p.basis,
    crowdEstimate: p.crowdEstimate,
    imageUrl: p.imageUrl,
    caption: p.caption,
    eventId: p.eventId,
    stageId: p.stageId,
    performer: { id: pf.id, name: pf.name, imageUrl: pf.imageUrl, type: pf.type, userId: pf.userId },
    venue: { id: v.id, name: v.name, city: v.city, imageUrl: v.imageUrl, logoStyle: v.logoStyle, kind: v.kind },
    nowPlaying: p.nowPlaying ?? null,
    likes: p.likesBase + (likeMap.get(p.id) ?? 0),
    liked: mineSet.has(p.id),
    reposts: p.reposts,
    requestCount: reqMap.get(p.id) ?? 0,
  }));
}

export async function requestDTOs(db: DB, rows: RequestRow[], viewerId: string | null): Promise<RequestDTO[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const [voteRows, reactRows, userRows] = await Promise.all([
    db.select().from(requestVotes).where(inArray(requestVotes.requestId, ids)),
    db.select().from(requestReactions).where(inArray(requestReactions.requestId, ids)),
    db.select().from(users).where(inArray(users.id, userIds)),
  ]);
  const userMap = new Map(userRows.map((u) => [u.id, u]));
  return rows.map((r) => {
    const votes = voteRows.filter((v) => v.requestId === r.id);
    const up = r.baseUp + votes.filter((v) => v.value > 0).length;
    const down = r.baseDown + votes.filter((v) => v.value < 0).length;
    const mineVote = viewerId ? votes.find((v) => v.userId === viewerId)?.value ?? 0 : 0;
    const reacts = reactRows.filter((x) => x.requestId === r.id);
    const emojis = new Set<string>([...Object.keys(r.reactionBase ?? {}), ...reacts.map((x) => x.emoji)]);
    const reactions = Array.from(emojis).map((emoji) => ({
      emoji,
      count: (r.reactionBase?.[emoji] ?? 0) + reacts.filter((x) => x.emoji === emoji).length,
      mine: !!viewerId && reacts.some((x) => x.emoji === emoji && x.userId === viewerId),
    }));
    const u = userMap.get(r.userId);
    return {
      id: r.id,
      performanceId: r.performanceId,
      kind: r.kind,
      track: r.track ?? null,
      message: r.message,
      priceCents: r.priceCents,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      decidedAt: iso(r.decidedAt),
      playedAt: iso(r.playedAt),
      user: u ? userBrief(u) : { id: r.userId, userName: 'Auxee', avatarUrl: null, ring: null, role: 'USER' },
      up,
      down,
      myVote: (mineVote > 0 ? 1 : mineVote < 0 ? -1 : 0) as 1 | -1 | 0,
      reactions,
    };
  });
}

export async function postDTOs(db: DB, rows: (typeof posts.$inferSelect)[], viewerId: string | null): Promise<PostDTO[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const userIds = Array.from(new Set(rows.flatMap((r) => [r.authorId, r.toUserId].filter(Boolean) as string[])));
  const [likeRows, userRows, attachments] = await Promise.all([
    db.select().from(postLikes).where(inArray(postLikes.postId, ids)),
    db.select().from(users).where(inArray(users.id, userIds)),
    resolveAttachments(db, rows, viewerId),
  ]);
  const userMap = new Map(userRows.map((u) => [u.id, u]));
  return rows.map((p) => {
    const likes = likeRows.filter((l) => l.postId === p.id);
    const author = userMap.get(p.authorId);
    const to = p.toUserId ? userMap.get(p.toUserId) : undefined;
    return {
      id: p.id,
      kind: p.kind,
      performanceId: p.performanceId,
      text: p.text,
      caption: p.caption,
      imageUrl: p.imageUrl,
      nowPlaying: p.nowPlaying,
      label: p.label,
      createdAt: p.createdAt.toISOString(),
      author: author ? userBrief(author) : { id: p.authorId, userName: 'Auxee', avatarUrl: null, ring: null, role: 'USER' },
      to: to ? userBrief(to) : null,
      likes: p.likesBase + likes.length,
      liked: !!viewerId && likes.some((l) => l.userId === viewerId),
      attachment: attachments.get(p.id) ?? null,
    };
  });
}

/** Turns post attachment refs into cards (and works out whether the viewer may open/join them). */
async function resolveAttachments(db: DB, rows: (typeof posts.$inferSelect)[], viewerId: string | null): Promise<Map<string, PostAttachment>> {
  const out = new Map<string, PostAttachment>();
  const withRefs = rows.filter((r) => r.attachment?.performanceId);
  if (!withRefs.length) return out;
  const perfIds = Array.from(new Set(withRefs.map((r) => r.attachment!.performanceId)));
  const reqIds = Array.from(new Set(withRefs.map((r) => r.attachment!.requestId).filter(Boolean) as string[]));
  const perfRows = await db
    .select({ p: performances, pfName: performers.name, pfImage: performers.imageUrl, vName: venues.name, vImage: venues.imageUrl, hostName: users.userName, hostAvatar: users.avatarUrl })
    .from(performances)
    .leftJoin(performers, eq(performers.id, performances.performerId))
    .leftJoin(venues, eq(venues.id, performances.venueId))
    .leftJoin(users, eq(users.id, performances.hostUserId))
    .where(inArray(performances.id, perfIds));
  const homeIds = perfRows.filter((r) => r.p.kind === 'HOME').map((r) => r.p.id);
  const [memberCounts, myMemberships, friendRows, reqRows, voteRows] = await Promise.all([
    homeIds.length
      ? db.select({ id: sessionMembers.performanceId, n: count() }).from(sessionMembers).where(inArray(sessionMembers.performanceId, homeIds)).groupBy(sessionMembers.performanceId)
      : Promise.resolve([] as { id: string; n: number }[]),
    homeIds.length && viewerId
      ? db.select({ id: sessionMembers.performanceId }).from(sessionMembers).where(and(inArray(sessionMembers.performanceId, homeIds), eq(sessionMembers.userId, viewerId)))
      : Promise.resolve([] as { id: string }[]),
    homeIds.length && viewerId
      ? db
          .select({ a: friendships.requesterId, b: friendships.addresseeId })
          .from(friendships)
          .where(and(eq(friendships.status, 'ACCEPTED'), or(eq(friendships.requesterId, viewerId), eq(friendships.addresseeId, viewerId))))
      : Promise.resolve([] as { a: string; b: string }[]),
    reqIds.length ? db.select().from(requests).where(inArray(requests.id, reqIds)) : Promise.resolve([] as RequestRow[]),
    reqIds.length
      ? db.select({ id: requestVotes.requestId, n: count() }).from(requestVotes).where(and(inArray(requestVotes.requestId, reqIds), sql`${requestVotes.value} > 0`)).groupBy(requestVotes.requestId)
      : Promise.resolve([] as { id: string; n: number }[]),
  ]);
  const perfMap = new Map(perfRows.map((r) => [r.p.id, r]));
  const countMap = new Map(memberCounts.map((c) => [c.id, Number(c.n)]));
  const mine = new Set(myMemberships.map((m) => m.id));
  const friends = new Set(friendRows.map((f) => (f.a === viewerId ? f.b : f.a)));
  const reqMap = new Map(reqRows.map((r) => [r.id, r]));
  const voteMap = new Map(voteRows.map((v) => [v.id, Number(v.n)]));
  for (const row of withRefs) {
    const ref = row.attachment!;
    const r = perfMap.get(ref.performanceId);
    if (!r) continue;
    const p = r.p;
    if (p.kind === 'HOME') {
      const canJoin =
        !!viewerId && (p.hostUserId === viewerId || mine.has(p.id) || p.visibility === 'PUBLIC' || (p.visibility === 'FRIENDS' && !!p.hostUserId && friends.has(p.hostUserId)));
      out.set(row.id, {
        type: 'session',
        performanceId: p.id,
        title: p.title,
        subtitle: `PASS THE AUX · hosted by ${r.hostName ?? 'an AUXee'}`,
        imageUrl: p.imageUrl ?? r.hostAvatar,
        status: perfStatus(p),
        canJoin,
        memberCount: countMap.get(p.id) ?? 1,
        track: p.nowPlaying?.track ?? null,
      });
      continue;
    }
    const req = ref.requestId ? reqMap.get(ref.requestId) : undefined;
    out.set(row.id, {
      type: ref.type === 'request' && req ? 'request' : 'set',
      performanceId: p.id,
      title: req?.track?.title ?? p.title,
      subtitle: req?.track ? `${req.track.artist} · requested at ${r.vName ?? ''}` : `${r.pfName ?? ''} · ${r.vName ?? ''}`,
      imageUrl: req?.track?.artwork ?? p.imageUrl ?? r.vImage ?? r.pfImage,
      status: perfStatus(p),
      canJoin: true,
      track: req?.track ?? p.nowPlaying?.track ?? null,
      up: req ? req.baseUp + (voteMap.get(req.id) ?? 0) : undefined,
    });
  }
  return out;
}

export async function eventDTO(db: DB, ev: typeof events.$inferSelect, viewerId: string | null): Promise<EventDTO> {
  const stageRows = await db.select().from(stages).where(eq(stages.eventId, ev.id)).orderBy(stages.sort);
  const briefs = await performanceBriefs(db, eq(performances.eventId, ev.id), viewerId);
  const now = new Date();
  return {
    id: ev.id,
    ownerId: ev.ownerId,
    title: ev.title,
    category: ev.category,
    venueId: ev.venueId,
    location: ev.location,
    subtitle: ev.subtitle,
    imageUrl: ev.imageUrl,
    heroColor: ev.heroColor,
    description: ev.description,
    startsAt: ev.startsAt.toISOString(),
    endsAt: ev.endsAt.toISOString(),
    lat: ev.lat,
    lng: ev.lng,
    live: briefs.some((b) => b.status === 'LIVE') || (ev.startsAt <= now && now < ev.endsAt),
    stages: stageRows.map((s) => {
      const forStage = briefs.filter((b) => b.stageId === s.id);
      const perf = forStage.find((b) => b.status === 'LIVE') ?? forStage.find((b) => b.status === 'UPCOMING') ?? forStage[0] ?? null;
      return { id: s.id, name: s.name, imageUrl: s.imageUrl, genre: s.genre, performance: perf };
    }),
  };
}

export async function loadPerformance(db: DB, id: string) {
  const rows = await db
    .select({ p: performances, pf: performers, v: venues })
    .from(performances)
    .innerJoin(performers, eq(performers.id, performances.performerId))
    .innerJoin(venues, eq(venues.id, performances.venueId))
    .where(eq(performances.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Recent wire-room posts for a performance (oldest first) or the global feed (newest first). */
export async function recentPosts(db: DB, performanceId: string | null, limit: number) {
  const where = performanceId
    ? and(eq(posts.performanceId, performanceId), sql`${posts.deletedAt} is null`)
    : and(sql`${posts.performanceId} is null`, sql`${posts.deletedAt} is null`);
  return db.select().from(posts).where(where).orderBy(desc(posts.createdAt)).limit(limit);
}
