/** 24-hour stories from DJs and venues: live sets, request highlights, photos and text. */
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import type { DB } from '../../db';
import { performances, performers, requests, stories, storyViews, users, venues } from '../../db/schema';
import type { PerformanceBrief, StoryDTO, StoryGroupDTO, StoryKind } from '../../types';
import { newId } from '../crypto';
import { bad, forbidden, notFound } from '../http';
import type { AuthedUser } from '../session';
import { perfStatus, performanceBriefs, requestDTOs } from './core';

const DAY = 24 * 3600_000;

async function performerOf(db: DB, userId: string) {
  return (await db.select().from(performers).where(eq(performers.userId, userId)).limit(1))[0] ?? null;
}

/** Sets (and their top requests) this DJ or owner may share to their story. */
export async function shareable(db: DB, user: AuthedUser) {
  let where;
  if (user.role === 'PERFORMER') {
    const pf = await performerOf(db, user.id);
    if (!pf) return { sets: [], requests: [] };
    where = eq(performances.performerId, pf.id);
  } else if (user.role === 'OWNER' || user.role === 'ADMIN') {
    const mine = await db.select({ id: venues.id }).from(venues).where(eq(venues.ownerId, user.id));
    if (!mine.length) return { sets: [], requests: [] };
    where = inArray(performances.venueId, mine.map((v) => v.id));
  } else {
    return { sets: [], requests: [] };
  }
  const sets: PerformanceBrief[] = await performanceBriefs(
    db,
    and(where, or(isNull(performances.endedAt), gt(performances.endedAt, new Date(Date.now() - DAY)))),
    user.id,
    { orderBy: 'startsDesc', limit: 12 },
  );
  const ids = sets.map((s) => s.id);
  const reqRows = ids.length
    ? await db
        .select()
        .from(requests)
        .where(and(inArray(requests.performanceId, ids), sql`${requests.status} <> 'REJECTED'`))
        .orderBy(desc(requests.createdAt))
        .limit(60)
    : [];
  const reqs = (await requestDTOs(db, reqRows, user.id)).sort((a, b) => b.up - a.up).slice(0, 10);
  return { sets, requests: reqs };
}

export async function createStory(
  db: DB,
  user: AuthedUser,
  input: { kind: StoryKind; performanceId?: string | null; requestId?: string | null; imageUrl?: string | null; text?: string | null },
) {
  if (user.role !== 'PERFORMER' && user.role !== 'OWNER' && user.role !== 'ADMIN') throw forbidden('Stories are for DJs and venues.');
  const pf = user.role === 'PERFORMER' ? await performerOf(db, user.id) : null;
  let performanceId = input.performanceId ?? null;
  let venueId: string | null = null;
  if (input.kind === 'REQUEST') {
    if (!input.requestId) throw bad('Pick a request to share.');
    const r = (await db.select().from(requests).where(eq(requests.id, input.requestId)).limit(1))[0];
    if (!r) throw notFound('Request not found.');
    performanceId = r.performanceId;
  }
  if (input.kind === 'SET' || input.kind === 'REQUEST') {
    if (!performanceId) throw bad('Pick a set to share.');
    const p = (await db.select().from(performances).where(eq(performances.id, performanceId)).limit(1))[0];
    if (!p || p.kind !== 'SET' || !p.venueId) throw notFound('Set not found.');
    if (user.role === 'PERFORMER' && p.performerId !== pf?.id) throw forbidden('You can only share your own sets.');
    if (user.role === 'OWNER') {
      const v = (await db.select().from(venues).where(eq(venues.id, p.venueId)).limit(1))[0];
      if (v?.ownerId !== user.id) throw forbidden('You can only share sets at your venues.');
    }
    venueId = p.venueId;
  }
  if (input.kind === 'PHOTO' && !input.imageUrl) throw bad('Add a photo.');
  if (input.kind === 'TEXT' && !input.text?.trim()) throw bad('Write something.');
  if (user.role === 'OWNER' && !venueId) {
    const v = (await db.select({ id: venues.id }).from(venues).where(eq(venues.ownerId, user.id)).limit(1))[0];
    venueId = v?.id ?? null;
  }
  const id = newId();
  await db.insert(stories).values({
    id,
    authorId: user.id,
    performerId: pf?.id ?? null,
    venueId: user.role === 'PERFORMER' ? null : venueId,
    kind: input.kind,
    performanceId: input.kind === 'SET' || input.kind === 'REQUEST' ? performanceId : null,
    requestId: input.kind === 'REQUEST' ? input.requestId! : null,
    imageUrl: input.imageUrl ?? null,
    text: input.text?.trim() || null,
    expiresAt: new Date(Date.now() + DAY),
  });
  return { id };
}

/** Active stories grouped by DJ / venue, unseen groups first. */
export async function listStories(db: DB, viewerId: string | null): Promise<StoryGroupDTO[]> {
  const rows = await db.select().from(stories).where(gt(stories.expiresAt, new Date())).orderBy(desc(stories.createdAt)).limit(200);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const perfIds = Array.from(new Set(rows.map((r) => r.performanceId).filter(Boolean) as string[]));
  const reqIds = Array.from(new Set(rows.map((r) => r.requestId).filter(Boolean) as string[]));
  const pfIds = Array.from(new Set(rows.map((r) => r.performerId).filter(Boolean) as string[]));
  const vIds = Array.from(new Set(rows.map((r) => r.venueId).filter(Boolean) as string[]));
  const authorIds = Array.from(new Set(rows.map((r) => r.authorId)));
  const [briefs, reqRows, pfRows, vRows, authors, viewed, viewCounts] = await Promise.all([
    perfIds.length ? performanceBriefs(db, inArray(performances.id, perfIds), viewerId) : Promise.resolve([] as PerformanceBrief[]),
    reqIds.length ? db.select().from(requests).where(inArray(requests.id, reqIds)) : Promise.resolve([]),
    pfIds.length ? db.select().from(performers).where(inArray(performers.id, pfIds)) : Promise.resolve([]),
    vIds.length ? db.select().from(venues).where(inArray(venues.id, vIds)) : Promise.resolve([]),
    db.select().from(users).where(inArray(users.id, authorIds)),
    viewerId ? db.select({ id: storyViews.storyId }).from(storyViews).where(and(inArray(storyViews.storyId, ids), eq(storyViews.userId, viewerId))) : Promise.resolve([]),
    db.select({ id: storyViews.storyId, n: sql<number>`count(*)` }).from(storyViews).where(inArray(storyViews.storyId, ids)).groupBy(storyViews.storyId),
  ]);
  const reqDTOs = await requestDTOs(db, reqRows, viewerId);
  const briefMap = new Map(briefs.map((b) => [b.id, b]));
  const reqMap = new Map(reqDTOs.map((r) => [r.id, r]));
  const pfMap = new Map(pfRows.map((p) => [p.id, p]));
  const vMap = new Map(vRows.map((v) => [v.id, v]));
  const authorMap = new Map(authors.map((u) => [u.id, u]));
  const viewedSet = new Set(viewed.map((v) => v.id));
  const viewCountMap = new Map(viewCounts.map((v) => [v.id, Number(v.n)]));

  const groups = new Map<string, StoryGroupDTO>();
  for (const r of rows) {
    const b = r.performanceId ? briefMap.get(r.performanceId) : undefined;
    const rq = r.requestId ? reqMap.get(r.requestId) : undefined;
    if ((r.kind === 'SET' && !b) || (r.kind === 'REQUEST' && (!rq || !b))) continue;
    const mine = r.authorId === viewerId;
    const story: StoryDTO = {
      id: r.id,
      kind: r.kind,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      text: r.text,
      imageUrl: r.imageUrl,
      set: b
        ? { id: b.id, title: b.title, status: b.status, venueName: b.venue.name, performerName: b.performer.name, imageUrl: b.imageUrl ?? b.venue.imageUrl ?? b.performer.imageUrl, nowPlaying: b.nowPlaying }
        : null,
      request: rq
        ? {
            id: rq.id,
            title: rq.track?.title ?? 'On The Mic',
            artist: rq.track?.artist ?? '',
            artwork: rq.track?.artwork ?? null,
            up: rq.up,
            requestedBy: rq.user.userName,
            kind: rq.kind,
            message: rq.message,
          }
        : null,
      viewed: viewedSet.has(r.id),
      views: mine ? viewCountMap.get(r.id) ?? 0 : undefined,
      mine,
    };
    const pf = r.performerId ? pfMap.get(r.performerId) : undefined;
    const v = r.venueId ? vMap.get(r.venueId) : undefined;
    const author = authorMap.get(r.authorId);
    const key = pf ? `p:${pf.id}` : v ? `v:${v.id}` : `u:${r.authorId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: pf?.name ?? v?.name ?? author?.userName ?? 'AUXED',
        imageUrl: pf?.imageUrl ?? v?.imageUrl ?? author?.avatarUrl ?? null,
        ring: author?.ring ?? null,
        kind: pf ? 'performer' : v ? 'venue' : 'user',
        seen: true,
        mine: false,
        latestAt: story.createdAt,
        stories: [],
      };
      groups.set(key, g);
    }
    g.stories.push(story);
    if (!story.viewed && !mine) g.seen = false;
    if (mine) g.mine = true;
  }
  const list = Array.from(groups.values());
  // Oldest first inside a group (story order), groups: mine, unseen, then most recent.
  list.forEach((g) => g.stories.reverse());
  list.sort((a, b) => Number(b.mine) - Number(a.mine) || Number(a.seen) - Number(b.seen) || b.latestAt.localeCompare(a.latestAt));
  return list;
}

export async function viewStory(db: DB, userId: string, storyId: string) {
  await db.insert(storyViews).values({ storyId, userId }).onConflictDoNothing();
  return { ok: true };
}

export async function deleteStory(db: DB, user: AuthedUser, storyId: string) {
  const s = (await db.select().from(stories).where(eq(stories.id, storyId)).limit(1))[0];
  if (!s) throw notFound('Story not found.');
  if (s.authorId !== user.id && user.role !== 'ADMIN') throw forbidden();
  await db.delete(stories).where(eq(stories.id, storyId));
  return { ok: true };
}

export const storyStatus = perfStatus;
