/**
 * AUX IN — hear the venue's speaker feed in your own earphones.
 *
 * A browser at the venue (the "broadcaster": a laptop or tablet with a USB audio interface on the
 * mixer's line-out) captures the live feed. Each listener's phone connects to it over WebRTC; this
 * service only does access control and signalling (offer/answer exchange). Peer-to-peer suits a
 * pilot (dozens of listeners per broadcaster); a media server (e.g. LiveKit) is the scale-up path.
 *
 * Access: a Day Pass for one venue, the monthly Aux Pass (all AUX IN venues), or a member perk
 * (the venue's member code). Listening only works on site: within range of the venue or checked in
 * with the door QR in the last 6 hours.
 */
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import type { DB } from '../../db';
import { sampleDataEnabled } from '../../db';
import { auxPasses, auxPeers, auxStreams, ledger, performances, performers, users, venueCheckins, venues } from '../../db/schema';
import { newId } from '../crypto';
import { HttpError, bad, forbidden, notFound } from '../http';
import type { AuthedUser } from '../session';
import { liveWhere, performanceBriefs } from './core';

export const AUX_PASS_MONTH_CENTS = 9900;
const DAY_PASS_HOURS = 18;
const CHECKIN_HOURS = 6;
const STALE_MS = 30_000;

function metres(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function venueOr404(db: DB, venueId: string) {
  const v = (await db.select().from(venues).where(eq(venues.id, venueId)).limit(1))[0];
  if (!v) throw notFound('Venue not found.');
  return v;
}

export async function activePass(db: DB, userId: string, venueId: string) {
  return (
    await db
      .select()
      .from(auxPasses)
      .where(and(eq(auxPasses.userId, userId), gt(auxPasses.validUntil, new Date()), or(eq(auxPasses.venueId, venueId), isNull(auxPasses.venueId))))
      .orderBy(desc(auxPasses.validUntil))
      .limit(1)
  )[0] ?? null;
}

export async function checkIn(db: DB, userId: string, venueId: string) {
  await venueOr404(db, venueId);
  await db.insert(venueCheckins).values({ userId, venueId, at: new Date() }).onConflictDoUpdate({ target: [venueCheckins.userId, venueCheckins.venueId], set: { at: new Date() } });
  return { ok: true };
}

async function isOnSite(db: DB, userId: string, venue: typeof venues.$inferSelect, lat?: number | null, lng?: number | null) {
  if (lat != null && lng != null && metres(lat, lng, venue.lat, venue.lng) <= (venue.kind === 'FESTIVAL' ? 1500 : 300)) return true;
  const c = (await db.select().from(venueCheckins).where(and(eq(venueCheckins.userId, userId), eq(venueCheckins.venueId, venue.id))).limit(1))[0];
  if (c && Date.now() - c.at.getTime() < CHECKIN_HOURS * 3600_000) return true;
  // Development: let testers listen from anywhere.
  return process.env.NODE_ENV !== 'production' && sampleDataEnabled();
}

async function liveStream(db: DB, venueId: string) {
  const s = (
    await db
      .select()
      .from(auxStreams)
      .where(and(eq(auxStreams.venueId, venueId), eq(auxStreams.status, 'LIVE')))
      .orderBy(desc(auxStreams.startedAt))
      .limit(1)
  )[0];
  if (s && Date.now() - s.heartbeatAt.getTime() > STALE_MS) return null;
  return s ?? null;
}

/** Everything the listener UI needs for a venue. */
export async function venueAuxInfo(db: DB, user: AuthedUser | null, venueId: string, lat?: number | null, lng?: number | null) {
  const v = await venueOr404(db, venueId);
  const stream = v.auxInEnabled ? await liveStream(db, v.id) : null;
  const [live] = await performanceBriefs(db, and(liveWhere(), eq(performances.venueId, v.id)), user?.id ?? null, { limit: 1 });
  const pass = user ? await activePass(db, user.id, v.id) : null;
  return {
    venueId: v.id,
    venueName: v.name,
    imageUrl: v.imageUrl,
    enabled: v.auxInEnabled,
    stream: stream ? { id: stream.id, zone: stream.zone, startedAt: stream.startedAt.toISOString() } : null,
    dayPassCents: v.auxInDayPassCents,
    monthPassCents: AUX_PASS_MONTH_CENTS,
    memberPerk: !!v.auxInMemberCode,
    pass: pass ? { kind: pass.kind, validUntil: pass.validUntil.toISOString() } : null,
    onSite: user ? await isOnSite(db, user.id, v, lat, lng) : false,
    performanceId: live?.id ?? null,
    nowPlaying: live?.nowPlaying ?? null,
  };
}

/** Day pass / monthly Aux Pass (paid from the token wallet) or member perk (code). */
export async function buyPass(db: DB, user: AuthedUser, venueId: string, kind: 'DAY' | 'MONTH' | 'MEMBER', code?: string | null) {
  const v = await venueOr404(db, venueId);
  if (!v.auxInEnabled) throw bad(`${v.name} doesn't have AUX IN yet.`);
  const existing = await activePass(db, user.id, v.id);
  if (existing && (existing.kind !== 'DAY' || kind === 'DAY')) return { pass: { kind: existing.kind, validUntil: existing.validUntil.toISOString() }, already: true };
  const now = Date.now();
  if (kind === 'MEMBER') {
    if (!v.auxInMemberCode) throw bad(`${v.name} doesn't offer a member perk.`);
    if (!code || code.trim().toLowerCase() !== v.auxInMemberCode.trim().toLowerCase()) throw new HttpError(403, "That member code isn't right. Ask the front desk.", 'BAD_CODE');
    const validUntil = new Date(now + 30 * 86400_000);
    await db.insert(auxPasses).values({ id: newId(), userId: user.id, venueId: v.id, kind, priceCents: 0, validUntil });
    return { pass: { kind, validUntil: validUntil.toISOString() } };
  }
  const price = kind === 'DAY' ? v.auxInDayPassCents : AUX_PASS_MONTH_CENTS;
  const validUntil = new Date(now + (kind === 'DAY' ? DAY_PASS_HOURS * 3600_000 : 30 * 86400_000));
  const id = newId();
  await db.transaction(async (tx) => {
    if (price > 0) {
      const ok = await tx
        .update(users)
        .set({ walletCents: sql`${users.walletCents} - ${price}` })
        .where(and(eq(users.id, user.id), sql`${users.walletCents} >= ${price}`))
        .returning({ id: users.id });
      if (!ok.length) throw new HttpError(402, 'Not enough tokens in your wallet. Top up to get the pass.', 'INSUFFICIENT_FUNDS');
      await tx.insert(ledger).values({ id: newId(), userId: user.id, type: 'PASS', amountCents: -price, note: kind === 'DAY' ? `AUX IN Day Pass — ${v.name}` : 'AUX Pass (30 days, all AUX IN venues)' });
    }
    await tx.insert(auxPasses).values({ id, userId: user.id, venueId: kind === 'DAY' ? v.id : null, kind, priceCents: price, validUntil });
  });
  return { pass: { kind, validUntil: validUntil.toISOString() } };
}

/* ------------------------------------------------------------------------- broadcaster */

/** Venues where this DJ's set is live right now (they can broadcast AUX IN from their own laptop). */
async function djLiveVenueIds(db: DB, user: AuthedUser): Promise<string[]> {
  if (user.role !== 'PERFORMER') return [];
  const rows = await db
    .select({ venueId: performances.venueId })
    .from(performances)
    .innerJoin(performers, eq(performers.id, performances.performerId))
    .where(and(eq(performers.userId, user.id), liveWhere()));
  return [...new Set(rows.map((r) => r.venueId).filter((x): x is string => !!x))];
}

/** The venue owner, or the DJ playing there now (when the venue offers AUX IN), can broadcast. */
async function ownedVenue(db: DB, user: AuthedUser, venueId: string) {
  const v = await venueOr404(db, venueId);
  if (v.ownerId === user.id || user.role === 'ADMIN') return v;
  if (v.auxInEnabled && (await djLiveVenueIds(db, user)).includes(v.id)) return v;
  throw forbidden('Only the venue, or the DJ playing there now, can broadcast AUX IN.');
}

export async function startStream(db: DB, user: AuthedUser, venueId: string, zone: string) {
  const v = await ownedVenue(db, user, venueId);
  if (!v.auxInEnabled) await db.update(venues).set({ auxInEnabled: true }).where(eq(venues.id, v.id));
  await db
    .update(auxStreams)
    .set({ status: 'ENDED', endedAt: new Date() })
    .where(and(eq(auxStreams.venueId, v.id), eq(auxStreams.zone, zone), eq(auxStreams.status, 'LIVE')));
  const id = newId();
  await db.insert(auxStreams).values({ id, venueId: v.id, zone, startedById: user.id });
  return { id };
}

async function ownedStream(db: DB, user: AuthedUser, streamId: string) {
  const s = (await db.select().from(auxStreams).where(eq(auxStreams.id, streamId)).limit(1))[0];
  if (!s) throw notFound('Stream not found.');
  await ownedVenue(db, user, s.venueId);
  return s;
}

/** Broadcaster poll: heartbeat + listeners waiting for an answer + live listener count. */
export async function broadcasterPoll(db: DB, user: AuthedUser, streamId: string) {
  const s = await ownedStream(db, user, streamId);
  if (s.status !== 'LIVE') return { status: s.status, waiting: [], listeners: 0 };
  await db.update(auxStreams).set({ heartbeatAt: new Date() }).where(eq(auxStreams.id, s.id));
  const waiting = await db
    .select({ id: auxPeers.id, offer: auxPeers.offer, userName: users.userName })
    .from(auxPeers)
    .innerJoin(users, eq(users.id, auxPeers.userId))
    .where(and(eq(auxPeers.streamId, s.id), eq(auxPeers.status, 'WAITING'), gt(auxPeers.createdAt, new Date(Date.now() - 60_000))))
    .limit(10);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(auxPeers)
    .where(and(eq(auxPeers.streamId, s.id), eq(auxPeers.status, 'CONNECTED'), gt(auxPeers.updatedAt, new Date(Date.now() - 75_000))));
  return { status: s.status, waiting, listeners: Number(n) };
}

export async function answerPeer(db: DB, user: AuthedUser, peerId: string, answer: string) {
  const p = (await db.select().from(auxPeers).where(eq(auxPeers.id, peerId)).limit(1))[0];
  if (!p) throw notFound();
  await ownedStream(db, user, p.streamId);
  await db.update(auxPeers).set({ answer, status: 'CONNECTED', updatedAt: new Date() }).where(eq(auxPeers.id, peerId));
  return { ok: true };
}

export async function endStream(db: DB, user: AuthedUser, streamId: string) {
  await ownedStream(db, user, streamId);
  await db.update(auxStreams).set({ status: 'ENDED', endedAt: new Date() }).where(eq(auxStreams.id, streamId));
  await db.update(auxPeers).set({ status: 'CLOSED', updatedAt: new Date() }).where(eq(auxPeers.streamId, streamId));
  return { ok: true };
}

/* ---------------------------------------------------------------------------- listener */

export async function joinStream(db: DB, user: AuthedUser, streamId: string, offer: string, lat?: number | null, lng?: number | null) {
  const s = (await db.select().from(auxStreams).where(eq(auxStreams.id, streamId)).limit(1))[0];
  if (!s || s.status !== 'LIVE' || Date.now() - s.heartbeatAt.getTime() > STALE_MS) throw new HttpError(409, 'The venue feed is offline right now.', 'OFFLINE');
  const v = await venueOr404(db, s.venueId);
  const owner = v.ownerId === user.id;
  if (!owner && !(await activePass(db, user.id, v.id))) throw new HttpError(402, 'Get a Day Pass, the Aux Pass or use your member code to listen in.', 'NEED_PASS');
  if (!owner && !(await isOnSite(db, user.id, v, lat, lng))) throw new HttpError(403, `AUX IN works on site only — you need to be at ${v.name} (or scan the door QR).`, 'NOT_ON_SITE');
  await db.update(auxPeers).set({ status: 'CLOSED' }).where(and(eq(auxPeers.streamId, s.id), eq(auxPeers.userId, user.id), eq(auxPeers.status, 'WAITING')));
  const id = newId();
  await db.insert(auxPeers).values({ id, streamId: s.id, userId: user.id, offer });
  return { peerId: id };
}

export async function listenerPoll(db: DB, user: AuthedUser, peerId: string) {
  const p = (await db.select().from(auxPeers).where(eq(auxPeers.id, peerId)).limit(1))[0];
  if (!p || p.userId !== user.id) throw notFound();
  if (p.status === 'CONNECTED') await db.update(auxPeers).set({ updatedAt: new Date() }).where(eq(auxPeers.id, p.id));
  return { status: p.status, answer: p.answer };
}

export async function closePeer(db: DB, user: AuthedUser, peerId: string) {
  const p = (await db.select().from(auxPeers).where(eq(auxPeers.id, peerId)).limit(1))[0];
  if (!p) return { ok: true };
  if (p.userId !== user.id) await ownedStream(db, user, p.streamId);
  await db.update(auxPeers).set({ status: 'CLOSED', updatedAt: new Date() }).where(eq(auxPeers.id, peerId));
  return { ok: true };
}

/** Owner view: AUX IN settings and numbers for each of their venues. */
export async function ownerAuxIn(db: DB, user: AuthedUser) {
  const owned = await db.select().from(venues).where(eq(venues.ownerId, user.id));
  const djVenues = await djLiveVenueIds(db, user);
  const playing = djVenues.length ? await db.select().from(venues).where(and(inArray(venues.id, djVenues), eq(venues.auxInEnabled, true))) : [];
  const rows = [...owned, ...playing.filter((p) => !owned.some((o) => o.id === p.id))];
  const out = [];
  for (const v of rows) {
    const stream = await liveStream(db, v.id);
    const [sales] = await db
      .select({ n: sql<number>`count(*)`, cents: sql<number>`coalesce(sum(${auxPasses.priceCents}), 0)` })
      .from(auxPasses)
      .where(and(eq(auxPasses.venueId, v.id), gt(auxPasses.createdAt, new Date(Date.now() - 30 * 86400_000))));
    out.push({
      venueId: v.id,
      name: v.name,
      /** Owners change the settings; a DJ only broadcasts. */
      canEdit: v.ownerId === user.id || user.role === 'ADMIN',
      enabled: v.auxInEnabled,
      dayPassCents: v.auxInDayPassCents,
      memberCode: v.auxInMemberCode,
      stream: stream ? { id: stream.id, zone: stream.zone, startedAt: stream.startedAt.toISOString() } : null,
      passes30d: Number(sales?.n ?? 0),
      revenue30dCents: Number(sales?.cents ?? 0),
    });
  }
  return { venues: out, monthPassCents: AUX_PASS_MONTH_CENTS };
}

export function iceServers() {
  const list: RTCIceServerLike[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URL) list.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  return list;
}
interface RTCIceServerLike {
  urls: string[];
  username?: string;
  credential?: string;
}
