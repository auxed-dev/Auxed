/**
 * Development only: give real (self-registered) test accounts realistic history so every screen
 * has something to show — wallet credit, request tickets, Treasure Box favourites and, for DJs,
 * past sets with crowd requests, earnings, a live set and stories. Safe to run more than once.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DB } from './index';
import { earnings, favorites, friendships, ledger, performances, performers, posts, requests, sessionMembers, stories, users } from './schema';
import { T } from './catalog';
import { IMG } from './media';
import { sampleFavorites } from './sampleSocial';
import { songPriceCents } from '../pricing';
import { DEFAULT_CONTROLS } from '../server/services/core';
import { newId } from '../server/crypto';
import type { CreativeControls, Track } from '../types';

const H = 3600_000;
const D = 24 * H;

export async function applyMockHistory(db: DB, email: string) {
  const u = (await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1))[0];
  if (!u) return { email, ok: false, note: 'No account with that email.' };
  const notes: string[] = [];
  if (u.role === 'USER') notes.push(...(await auxee(db, u.id)));
  else if (u.role === 'PERFORMER') notes.push(...(await dj(db, u.id, u.userName)));
  else notes.push('Owner accounts use the sample venues — nothing to add.');
  await befriend(db, u.id);
  return { email, ok: true, role: u.role, notes };
}

async function befriend(db: DB, userId: string) {
  for (const other of ['u_vicky', 'u_dave', 'u_jackie']) {
    await db.insert(friendships).values({ requesterId: other, addresseeId: userId, status: 'ACCEPTED' }).onConflictDoNothing();
  }
  // Real test accounts are friends with each other too.
  const real = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`${users.id} not like 'u\\_%'`, sql`${users.email} not like '%@example.com'`, sql`${users.id} <> ${userId}`));
  for (const r of real) {
    const exists = await db
      .select({ s: friendships.status })
      .from(friendships)
      .where(sql`(${friendships.requesterId} = ${userId} and ${friendships.addresseeId} = ${r.id}) or (${friendships.requesterId} = ${r.id} and ${friendships.addresseeId} = ${userId})`)
      .limit(1);
    if (!exists[0]) await db.insert(friendships).values({ requesterId: r.id, addresseeId: userId, status: 'ACCEPTED' });
  }
}

/* -------------------------------------------------------------------- AUXee */

async function auxee(db: DB, userId: string) {
  const notes: string[] = [];
  const already = await db.select({ id: ledger.id }).from(ledger).where(and(eq(ledger.userId, userId), eq(ledger.note, 'Test tokens (development)'))).limit(1);
  if (!already[0]) {
    await db.update(users).set({ walletCents: sql`${users.walletCents} + 50000` }).where(eq(users.id, userId));
    await db.insert(ledger).values({ id: newId(), userId, type: 'ADJUSTMENT', amountCents: 50000, note: 'Test tokens (development)' });
    notes.push('Added R500.00 test tokens.');
  }
  // A few played requests at live sample sets -> request tickets and history.
  const mine = await db.select({ id: requests.id }).from(requests).where(eq(requests.userId, userId)).limit(1);
  if (!mine[0]) {
    const live = await db.select({ id: performances.id }).from(performances).where(inArray(performances.id, ['pf_djaux_xoyo', 'pf_drama', 'pf_bc']));
    const ids = new Set(live.map((l) => l.id));
    const plan: [string, Track, 'PLAYED' | 'QUEUED'][] = [
      ['pf_djaux_xoyo', T.sirens, 'PLAYED'],
      ['pf_djaux_xoyo', T.gbp, 'QUEUED'],
      ['pf_drama', T.mnike, 'PLAYED'],
      ['pf_bc', T.drive, 'PLAYED'],
    ];
    for (const [pid, track, status] of plan) {
      if (!ids.has(pid)) continue;
      const id = newId();
      const price = songPriceCents(track, DEFAULT_CONTROLS);
      const when = new Date(Date.now() - (status === 'PLAYED' ? 50 : 5) * 60_000);
      await db.insert(requests).values({ id, performanceId: pid, userId, kind: 'SONG', track, priceCents: price, status, createdAt: when, decidedAt: when, playedAt: status === 'PLAYED' ? when : null, baseUp: 120 });
      await db.insert(ledger).values({ id: newId(), userId, type: 'REQUEST', amountCents: -price, note: `Request: ${track.title} — ${track.artist}`, requestId: id, createdAt: when });
      await db.update(users).set({ walletCents: sql`${users.walletCents} - ${price}` }).where(eq(users.id, userId));
    }
    notes.push('Added request history (tickets) at XOYO London, Drama PTA and Anomalie Art Club.');
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(favorites).where(eq(favorites.userId, userId));
  if (Number(n) === 0) {
    await sampleFavorites(db, userId);
    notes.push('Filled the Treasure Box: saved songs and sets, friend shares, Spotify and Apple Music imports.');
  }
  // Join the friends' braai session.
  const braai = (await db.select({ id: performances.id }).from(performances).where(and(eq(performances.kind, 'HOME'), eq(performances.hostUserId, 'u_vicky'), sql`${performances.endedAt} is null`)).limit(1))[0];
  if (braai) await db.insert(sessionMembers).values({ performanceId: braai.id, userId, role: 'GUEST' }).onConflictDoNothing();
  return notes;
}

/* ----------------------------------------------------------------------- DJ */

const DJ_CONTROLS: CreativeControls = {
  ...DEFAULT_CONTROLS,
  requestIntake: 12,
  genres: [
    { name: 'Amapiano', weight: 70 },
    { name: 'Afro House', weight: 55 },
    { name: 'Hip-Hop', weight: 35 },
  ],
  mic: 'YES_PLUS',
  micPrice: 20,
  micFilters: ['hate'],
  integrations: ['apple-music', 'spotify', 'virtual-dj'],
};

async function dj(db: DB, userId: string, name: string) {
  const notes: string[] = [];
  let pf = (await db.select().from(performers).where(eq(performers.userId, userId)).limit(1))[0];
  if (!pf) {
    const id = newId();
    await db.insert(performers).values({ id, userId, name, type: 'DJ', genres: [], controls: DEFAULT_CONTROLS });
    pf = (await db.select().from(performers).where(eq(performers.id, id)).limit(1))[0];
  }
  if (!pf.imageUrl || !pf.genres.length) {
    await db
      .update(performers)
      .set({ imageUrl: pf.imageUrl ?? IMG.djMixer, genres: ['Amapiano', 'Afro House', 'Hip-Hop'], bio: pf.bio ?? 'Amapiano and Afro House selector. Send the requests — I read every one.', controls: DJ_CONTROLS })
      .where(eq(performers.id, pf.id));
    await db.update(users).set({ avatarUrl: IMG.djMixer, ring: '#2F5F4E' }).where(and(eq(users.id, userId), sql`${users.avatarUrl} is null`));
    notes.push('Set up the artist portfolio and Creative Controls.');
  }
  const past = await db
    .select({ id: performances.id })
    .from(performances)
    .where(and(eq(performances.performerId, pf.id), sql`${performances.endedAt} is not null`))
    .limit(3);
  if (past.length >= 3) return [...notes, 'Past sets already exist — left them as they are.'];

  const crowd = (await db.select({ id: users.id }).from(users).where(sql`${users.id} like 'u\\_c%'`).limit(60)).map((c) => c.id);
  const fans = ['u_auxee', 'u_vicky', 'u_dave', 'u_jackie', ...crowd];
  const realAuxees = (await db.select({ id: users.id }).from(users).where(and(eq(users.role, 'USER'), sql`${users.id} not like 'u\\_%'`, sql`${users.email} not like '%@example.com'`))).map((r) => r.id);
  let rnd = 7;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const pick = <X,>(xs: X[]) => xs[Math.floor(rand() * xs.length)];
  const pool = [T.mnike, T.mnike2, T.imithandazo, T.epop, T.yesgod, T.dlala, T.bogogo, T.water, T.calmdown, T.unavailable, T.gbp, T.sirens, T.housebliss, T.fetch, T.comewithme, T.places];
  const now = Date.now();

  type SetPlan = { venueId: string; title: string; startOffset: number; hours: number; kind: 'past' | 'live' | 'next'; image: string };
  const plans: SetPlan[] = [
    { venueId: 'v_carpet', title: 'Friday Night', startOffset: -27 * D, hours: 3, kind: 'past', image: IMG.carpetShop },
    { venueId: 'v_drama', title: 'Amapiano Sundays', startOffset: -19 * D, hours: 3, kind: 'past', image: IMG.drama },
    { venueId: 'v_xoyo', title: 'Late Session', startOffset: -11 * D, hours: 2.5, kind: 'past', image: IMG.xoyo },
    { venueId: 'v_carwash', title: 'Sunset Set', startOffset: -4 * D, hours: 3, kind: 'past', image: IMG.carwash },
    { venueId: 'v_tresor', title: 'Tresor Takeover', startOffset: -40 * 60_000, hours: 4, kind: 'live', image: IMG.tresor },
    { venueId: 'v_carpet', title: 'The Carpet Shop', startOffset: 3 * D, hours: 3, kind: 'next', image: IMG.carpetShop },
  ];
  let liveId: string | null = null;
  for (const plan of plans) {
    const id = newId();
    const startsAt = new Date(now + plan.startOffset);
    const endsAt = new Date(startsAt.getTime() + plan.hours * H);
    const setlist = Array.from({ length: 8 }, () => pick(pool)).filter((t, i, a) => a.indexOf(t) === i);
    await db.insert(performances).values({
      id,
      performerId: pf.id,
      venueId: plan.venueId,
      title: plan.title,
      startsAt,
      endsAt,
      wentLiveAt: plan.kind === 'next' ? null : startsAt,
      endedAt: plan.kind === 'past' ? endsAt : null,
      crowdEstimate: 800 + Math.round(rand() * 3000),
      imageUrl: plan.image,
      caption: plan.kind === 'past' ? `${plan.title} — thank you for every single request 🙏` : null,
      setlist,
      nowPlaying: plan.kind === 'live' ? { track: setlist[0], startedAt: new Date(now - 60_000).toISOString() } : null,
      likesBase: Math.round(rand() * 900),
      reposts: Math.round(rand() * 20),
      createdById: userId,
    });
    if (plan.kind === 'live') liveId = id;
    if (plan.kind === 'next') continue;
    const n = plan.kind === 'past' ? 14 + Math.round(rand() * 10) : 5;
    for (let i = 0; i < n; i++) {
      const mic = rand() < 0.12;
      const track = pick(pool);
      const userIdFor = i === 0 && realAuxees.length ? realAuxees[0] : pick(fans);
      const price = mic ? DJ_CONTROLS.micPrice * 100 : songPriceCents(track, DJ_CONTROLS);
      const when = new Date(startsAt.getTime() + (i / n) * plan.hours * H * 0.9);
      const status = plan.kind === 'past' ? 'PLAYED' : i < 2 ? 'PENDING' : i === 2 ? 'PLAYING' : 'QUEUED';
      const rid = newId();
      await db.insert(requests).values({
        id: rid,
        performanceId: id,
        userId: userIdFor,
        kind: mic ? 'MIC' : 'SONG',
        track: mic ? null : track,
        message: mic ? pick(['Happy birthday Lerato! 🎉', 'Shout out to the Soweto crew!', 'Play one for the ladies 💃🏽']) : null,
        priceCents: price,
        status,
        createdAt: when,
        decidedAt: status === 'PENDING' ? null : when,
        playedAt: status === 'PLAYED' ? when : null,
        baseUp: Math.round(rand() * 60),
        baseDown: Math.round(rand() * 4),
        reactionBase: { '🔥': Math.round(rand() * 40), '🙌': Math.round(rand() * 15) },
      });
      if (status !== 'PENDING') {
        const share = Math.round(price * 0.5);
        await db.insert(earnings).values([
          { id: newId(), requestId: rid, beneficiaryType: 'PERFORMER', beneficiaryId: pf.id, amountCents: share, createdAt: when },
          { id: newId(), requestId: rid, beneficiaryType: 'VENUE', beneficiaryId: plan.venueId, amountCents: price - share, createdAt: when },
        ]);
      }
    }
    await db.insert(posts).values([
      { id: newId(), authorId: pick(fans), kind: 'CHAT', performanceId: id, text: pick(['This set is unreal 🔥', 'Played my song!! 😭', 'Best night this month']), createdAt: new Date(startsAt.getTime() + 40 * 60_000) },
      { id: newId(), authorId: pick(fans), kind: 'CHAT', performanceId: id, text: pick(['Who requested Mnike 😂 legend', 'Section 3 is going crazy', 'Encore!!']), createdAt: new Date(startsAt.getTime() + 90 * 60_000) },
    ]);
  }
  notes.push('Created 4 past sets (with crowd requests, chat and earnings), a live set at Tresor and an upcoming set at The Carpet Shop.');
  if (liveId) {
    await db.insert(stories).values([
      { id: newId(), authorId: userId, performerId: pf.id, kind: 'SET', performanceId: liveId, createdAt: new Date(now - 30 * 60_000), expiresAt: new Date(now + 23.5 * H) },
      { id: newId(), authorId: userId, performerId: pf.id, kind: 'TEXT', text: 'Tresor, you are LOUD tonight 🔊 keep the requests coming', createdAt: new Date(now - 10 * 60_000), expiresAt: new Date(now + 23.8 * H) },
    ]);
    notes.push('Posted two stories (live set + a message).');
  }
  // An On The Mic shout-out to the DJ from a fan (Treasure Box moments).
  await db.insert(posts).values({ id: newId(), authorId: 'u_vicky', kind: 'MIC', performanceId: null, text: `${name}, that Drama PTA set was everything!`, toUserId: userId, label: 'To You On The Mic', createdAt: new Date(now - 6 * H) });
  return notes;
}
