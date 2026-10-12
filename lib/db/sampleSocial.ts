/**
 * Sample-data only (development / AUXED_SAMPLE_DATA): keeps the social side populated —
 * today's DJ/venue stories, a live PASS THE AUX session among the sample friends, and Treasure Box
 * favourites. Stories expire after 24h, so this tops them up. Never runs with sample data off.
 */
import { and, count, eq, gt, inArray, sql } from 'drizzle-orm';
import type { DB } from './index';
import { sampleDataEnabled } from './index';
import { favorites, performances, posts, requests, sessionMembers, stories, users, venues } from './schema';
import { T } from './catalog';
import { IMG } from './media';
import { newId } from '../server/crypto';

let lastCheck = 0;
let inflight: Promise<void> | null = null;
const H = 3600_000;

export async function ensureSampleSocial(db: DB) {
  if (!sampleDataEnabled()) return;
  if (inflight) return inflight; // parallel requests share one run (avoids duplicate rows)
  if (Date.now() - lastCheck < 60_000) return;
  lastCheck = Date.now();
  inflight = (async () => {
    const sample = await db.select({ id: users.id }).from(users).where(eq(users.id, 'u_wire')).limit(1);
    if (!sample[0]) return; // sample content was never seeded
    await sampleStories(db);
    await sampleHomeSession(db);
    // AUX IN at the sample owner's venues (Drama PTA has a member perk: code DRAMA-VIP).
    await db.update(venues).set({ auxInEnabled: true }).where(and(inArray(venues.id, ['v_xoyo', 'v_carpet', 'v_drama']), eq(venues.auxInEnabled, false)));
    await db.update(venues).set({ auxInMemberCode: 'DRAMA-VIP' }).where(and(eq(venues.id, 'v_drama'), sql`${venues.auxInMemberCode} is null`));
    await sampleFavorites(db, 'u_auxee');
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function sampleStories(db: DB) {
  const [{ n }] = await db.select({ n: count() }).from(stories).where(gt(stories.createdAt, new Date(Date.now() - 20 * H)));
  if (Number(n) > 0) return;
  const live = await db.select({ id: performances.id }).from(performances).where(inArray(performances.id, ['pf_djaux_xoyo', 'pf_drama', 'pf_bc', 'pf_maphorisa', 'pf_finesse']));
  const has = new Set(live.map((l) => l.id));
  const topReq = has.has('pf_djaux_xoyo')
    ? (await db.select({ id: requests.id }).from(requests).where(eq(requests.performanceId, 'pf_djaux_xoyo')).orderBy(sql`${requests.baseUp} desc`).limit(1))[0]
    : undefined;
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * H);
  const exp = (hoursAgo: number) => new Date(Date.now() - hoursAgo * H + 24 * H);
  const rows: (typeof stories.$inferInsert)[] = [];
  const add = (r: Omit<typeof stories.$inferInsert, 'id' | 'expiresAt'> & { ago: number }) => {
    const { ago, ...rest } = r;
    rows.push({ id: newId(), ...rest, createdAt: at(ago), expiresAt: exp(ago) });
  };
  if (has.has('pf_djaux_xoyo')) add({ authorId: 'u_artist', performerId: 'p_djaux', kind: 'SET', performanceId: 'pf_djaux_xoyo', ago: 1.5 });
  if (topReq) add({ authorId: 'u_artist', performerId: 'p_djaux', kind: 'REQUEST', performanceId: 'pf_djaux_xoyo', requestId: topReq.id, ago: 1 });
  add({ authorId: 'u_artist', performerId: 'p_djaux', kind: 'TEXT', text: 'XOYO London, you lot are something else tonight 🔥 keep the requests coming!', ago: 0.5 });
  if (has.has('pf_drama')) add({ authorId: 'u_owner', venueId: 'v_drama', kind: 'SET', performanceId: 'pf_drama', ago: 2 });
  add({ authorId: 'u_owner', venueId: 'v_drama', kind: 'PHOTO', imageUrl: IMG.drama, text: 'Doors open 21:00 — Uncle Waffles in the building 🩷', ago: 5 });
  if (has.has('pf_bc')) add({ authorId: 'u_wire', performerId: 'p_blackcoffee', kind: 'SET', performanceId: 'pf_bc', ago: 3 });
  add({ authorId: 'u_wire', performerId: 'p_blackcoffee', kind: 'PHOTO', imageUrl: IMG.djSet, text: 'Berlin 🖤', ago: 6 });
  add({ authorId: 'u_wire', performerId: 'p_waffles', kind: 'PHOTO', imageUrl: IMG.djPink, text: 'Pretoria tonight. Who’s pulling up?', ago: 4 });
  if (has.has('pf_maphorisa')) add({ authorId: 'u_wire', performerId: 'p_maphorisa', kind: 'SET', performanceId: 'pf_maphorisa', ago: 2.5 });
  add({ authorId: 'u_owner', venueId: 'v_xoyo', kind: 'PHOTO', imageUrl: IMG.xoyo, text: 'Sold out. See you on the floor.', ago: 7 });
  if (has.has('pf_finesse')) add({ authorId: 'u_wire', performerId: 'p_finesse', kind: 'SET', performanceId: 'pf_finesse', ago: 3.5 });
  if (rows.length) await db.insert(stories).values(rows);
}

async function sampleHomeSession(db: DB) {
  const existing = await db
    .select({ id: performances.id })
    .from(performances)
    .where(and(eq(performances.kind, 'HOME'), eq(performances.hostUserId, 'u_vicky'), sql`${performances.endedAt} is null`, gt(performances.endsAt, new Date())))
    .orderBy(performances.startsAt);
  if (existing.length > 1) {
    // Tidy up any duplicates from an earlier race.
    await db.delete(performances).where(inArray(performances.id, existing.slice(1).map((e) => e.id)));
  }
  if (existing[0]) return;
  const id = newId();
  const now = Date.now();
  await db.insert(performances).values({
    id,
    kind: 'HOME',
    hostUserId: 'u_vicky',
    visibility: 'FRIENDS',
    joinCode: `VICKY${Math.floor(Math.random() * 90 + 10)}`.slice(0, 6),
    homeSettings: { approval: 'AUTO', perGuestLimit: 3, source: 'Spotify on the JBL' },
    title: 'Vicky’s Braai Session',
    startsAt: new Date(now - 1.5 * H),
    endsAt: new Date(now + 10 * H),
    wentLiveAt: new Date(now - 1.5 * H),
    imageUrl: IMG.sparkle,
    crowdEstimate: 4,
    createdById: 'u_vicky',
  });
  await db
    .insert(sessionMembers)
    .values([
      { performanceId: id, userId: 'u_vicky', role: 'HOST' },
      { performanceId: id, userId: 'u_auxee', role: 'GUEST' },
      { performanceId: id, userId: 'u_jackie', role: 'GUEST' },
      { performanceId: id, userId: 'u_dave', role: 'GUEST' },
    ])
    .onConflictDoNothing();
  const q = (userId: string, track: (typeof T)[keyof typeof T], up: number) => ({
    id: newId(),
    performanceId: id,
    userId,
    kind: 'SONG' as const,
    track,
    priceCents: 0,
    status: 'QUEUED' as const,
    decidedAt: new Date(),
    baseUp: up,
  });
  await db.insert(requests).values([q('u_jackie', T.water, 3), q('u_dave', T.calmdown, 2), q('u_vicky', T.mnike, 4), q('u_jackie', T.peaches, 1)]);
  await db.insert(posts).values([
    { id: newId(), authorId: 'u_vicky', kind: 'CHAT', performanceId: id, text: 'Meat’s on the fire 🔥 add your songs!', createdAt: new Date(now - 80 * 60_000) },
    { id: newId(), authorId: 'u_dave', kind: 'CHAT', performanceId: id, text: 'Who added Calm Down 😂 respect', createdAt: new Date(now - 40 * 60_000) },
    {
      id: newId(),
      authorId: 'u_vicky',
      kind: 'CHAT',
      performanceId: null,
      text: 'Braai at mine — passing the aux, come through 🎶',
      attachment: { type: 'session', performanceId: id },
      createdAt: new Date(now - 85 * 60_000),
    },
  ]);
}

/** Saved songs, friend shares and mock imports from Spotify / Apple Music for a user. */
export async function sampleFavorites(db: DB, userId: string) {
  const [{ n }] = await db.select({ n: count() }).from(favorites).where(eq(favorites.userId, userId));
  if (Number(n) > 0) return;
  const friendIds = (await db.select({ id: users.id }).from(users).where(inArray(users.id, ['u_jackie', 'u_vicky', 'u_dave']))).map((u) => u.id);
  const from = (i: number) => friendIds[i % Math.max(1, friendIds.length)] ?? null;
  const setIds = new Set(
    (await db.select({ id: performances.id }).from(performances).where(inArray(performances.id, ['pf_bc', 'pf_djaux_xoyo', 'pf_dstv']))).map((p) => p.id),
  );
  const ago = (h: number) => new Date(Date.now() - h * H);
  const rows: (typeof favorites.$inferInsert)[] = [
    { id: newId(), userId, kind: 'TRACK', track: T.water, source: 'AUXED', createdAt: ago(2) },
    { id: newId(), userId, kind: 'TRACK', track: T.comewithme, source: 'AUXED', performanceId: setIds.has('pf_bc') ? 'pf_bc' : null, createdAt: ago(20) },
    { id: newId(), userId, kind: 'TRACK', track: T.sirens, source: 'AUXED', createdAt: ago(40) },
    { id: newId(), userId, kind: 'TRACK', track: T.mylove, source: 'FRIEND', fromUserId: from(0), note: 'This one’s for you 😂', createdAt: ago(5) },
    { id: newId(), userId, kind: 'TRACK', track: T.places, source: 'FRIEND', fromUserId: from(1), note: 'Gym anthem', createdAt: ago(30) },
    { id: newId(), userId, kind: 'TRACK', track: T.gbp, source: 'SPOTIFY', createdAt: ago(48) },
    { id: newId(), userId, kind: 'TRACK', track: T.calmdown, source: 'SPOTIFY', createdAt: ago(49) },
    { id: newId(), userId, kind: 'TRACK', track: T.unavailable, source: 'SPOTIFY', createdAt: ago(50) },
    { id: newId(), userId, kind: 'TRACK', track: T.photograph, source: 'APPLE_MUSIC', createdAt: ago(60) },
    { id: newId(), userId, kind: 'TRACK', track: T.walking, source: 'APPLE_MUSIC', createdAt: ago(61) },
  ];
  if (setIds.has('pf_bc')) rows.push({ id: newId(), userId, kind: 'SET', performanceId: 'pf_bc', source: 'FRIEND', fromUserId: from(2), note: 'You HAVE to hear this set', createdAt: ago(8) });
  if (setIds.has('pf_dstv')) rows.push({ id: newId(), userId, kind: 'SET', performanceId: 'pf_dstv', source: 'AUXED', createdAt: ago(70) });
  await db.insert(favorites).values(rows);
}
