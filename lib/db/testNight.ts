/**
 * Development: a ready-to-test night out. One DJ is live at one venue, with a set list, a few crowd
 * requests and AUX IN switched on (members get in with the code). Run the broadcaster for the venue
 * (/owner/aux-in, "Test sound") and the whole flow can be tried from an AUXee account.
 */
import { and, eq, like } from 'drizzle-orm';
import type { DB } from './index';
import { earnings, performances, performers, requests, users, venues } from './schema';
import { T } from './catalog';
import { IMG } from './media';
import { songPriceCents } from '../pricing';
import type { Track } from '../types';
import { newId } from '../server/crypto';
import { liveWhere } from '../server/services/core';
import { closePerformance } from '../server/services/rooms';

const H = 3600_000;
const MEMBER_CODE = 'CARPET-VIP';

export async function setUpTestNight(db: DB, djName = 'JackBoy', venueId = 'v_carpet') {
  const u = (await db.select().from(users).where(and(eq(users.userName, djName), eq(users.role, 'PERFORMER'))).limit(1))[0];
  if (!u) return { ok: false as const, note: `No DJ account called ${djName}.` };
  const pf = (await db.select().from(performers).where(eq(performers.userId, u.id)).limit(1))[0];
  if (!pf) return { ok: false as const, note: `${djName} has no artist profile yet.` };
  const v = (await db.select().from(venues).where(eq(venues.id, venueId)).limit(1))[0];
  if (!v) return { ok: false as const, note: `Venue ${venueId} not found.` };

  await db.update(venues).set({ auxInEnabled: true, auxInMemberCode: v.auxInMemberCode ?? MEMBER_CODE }).where(eq(venues.id, v.id));

  // One DJ at the venue tonight: close anyone else's live set there (refunds as usual).
  const live = await db.select({ id: performances.id, performerId: performances.performerId }).from(performances).where(and(liveWhere(), eq(performances.venueId, v.id)));
  for (const p of live) if (p.performerId !== pf.id) await closePerformance(db, p.id);

  const now = Date.now();
  const setlist: Track[] = ([T.mnike, T.imithandazo, T.epop, T.yesgod, T.dlala, T.bogogo, T.water, T.calmdown, T.unavailable, T.gbp, T.sirens, T.mnike2] as Track[]).filter((t) => !!t?.previewUrl);
  const mine = live.find((p) => p.performerId === pf.id);
  const timing = { startsAt: new Date(now - 30 * 60_000), endsAt: new Date(now + 6 * H), wentLiveAt: new Date(now - 30 * 60_000) };
  let id = mine?.id;
  if (id) {
    await db
      .update(performances)
      .set({ ...timing, setlist, nowPlaying: { track: setlist[0], startedAt: new Date(now - 40_000).toISOString() } })
      .where(eq(performances.id, id));
  } else {
    id = newId();
    await db.insert(performances).values({
      id,
      performerId: pf.id,
      venueId: v.id,
      title: `${djName} Live`,
      ...timing,
      crowdEstimate: 1200,
      imageUrl: v.imageUrl ?? IMG.carpetShop,
      setlist,
      nowPlaying: { track: setlist[0], startedAt: new Date(now - 40_000).toISOString() },
      createdById: u.id,
    });
    // A few requests from the sample crowd: two waiting for the DJ, three accepted.
    const crowd = (await db.select({ id: users.id }).from(users).where(like(users.id, 'u\\_c%')).limit(5)).map((c) => c.id);
    const picks = [T.water, T.sirens, T.yesgod, T.calmdown, T.gbp];
    for (const [i, track] of picks.entries()) {
      if (!track || !crowd[i]) continue;
      const price = songPriceCents(track, pf.controls);
      const status = i < 2 ? ('PENDING' as const) : ('QUEUED' as const);
      const when = new Date(now - (10 - i) * 60_000);
      const rid = newId();
      await db.insert(requests).values({ id: rid, performanceId: id, userId: crowd[i], kind: 'SONG', track, priceCents: price, status, createdAt: when, decidedAt: status === 'QUEUED' ? when : null, baseUp: 8 - i });
      if (status === 'QUEUED') {
        const share = Math.round(price * (v.artistSharePct / 100));
        await db.insert(earnings).values([
          { id: newId(), requestId: rid, beneficiaryType: 'PERFORMER', beneficiaryId: pf.id, amountCents: share, createdAt: when },
          { id: newId(), requestId: rid, beneficiaryType: 'VENUE', beneficiaryId: v.id, amountCents: price - share, createdAt: when },
        ]);
      }
    }
  }
  return { ok: true as const, performanceId: id, url: `/sets/${id}`, venue: v.name, memberCode: v.auxInMemberCode ?? MEMBER_CODE };
}
