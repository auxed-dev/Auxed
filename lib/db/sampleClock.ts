/**
 * Sample data (development only) is written relative to the moment it was seeded: sets that are
 * "live now", festival stages "in 3 hours", bookings "next Friday". The local database lives on
 * for days, so this keeps it current: those sets and events move forward with the clock, and the
 * weekly request history behind the dashboards is filled in for the weeks since the seed.
 * Only rows the seed created (fixed ids) are moved; anything made in the app is left alone.
 */
import { and, eq, gte, isNotNull, isNull, like, notLike, or, sql } from 'drizzle-orm';
import type { DB } from './index';
import { earnings, events, favorites, performances, requests, venues } from './schema';
import { T } from './catalog';
import type { Track } from '../types';
import { newId } from '../server/crypto';

const H = 3600_000;
const D = 24 * H;
/** Seeded live 75 minutes before the seed ran, so it tells us when "now" was for the sample data. */
const ANCHOR = 'pf_virgin';
const ANCHOR_STARTED_AGO = 75 * 60_000;
/** Same weekly residencies as the seed (lib/db/seed.ts). */
const HISTORY_START = new Date('2026-01-02T22:00:00+02:00').getTime();
const ROSTERS: Record<string, { offsetH: number; performers: string[] }> = {
  v_xoyo: { offsetH: 1, performers: ['p_djaux', 'p_waffles', 'p_maphorisa', 'p_djaux'] },
  v_carpet: { offsetH: 0, performers: ['p_maphorisa', 'p_djaux', 'p_mellow'] },
  v_drama: { offsetH: 2, performers: ['p_mellow', 'p_waffles', 'p_drama'] },
};

/** House sound for the sample venues (databases seeded before venues had one). */
const SAMPLE_HOUSE_SOUND: Record<string, string[]> = {
  v_xoyo: ['UK Rap', 'Hip-Hop', 'House'],
  v_carpet: ['Amapiano', 'Afro House', 'Hip-Hop'],
  v_drama: ['Amapiano', 'House', 'Afrobeats'],
};

/**
 * Sample songs that pointed at the wrong recording (a remix, a live take, a radio edit) before the
 * catalogue was audited — old Apple id -> the original. Copies already in the database are repaired.
 */
const TRACK_FIXES: Record<string, Track> = { '6798959879': T.walking, '1433879362': T.drive, '1784251613': T.photograph };

async function repairSampleTracks(db: DB) {
  for (const [oldId, track] of Object.entries(TRACK_FIXES)) {
    const json = sql`${JSON.stringify(track)}::jsonb`;
    await db.update(requests).set({ track: json as unknown as Track }).where(sql`${requests.track}->>'externalId' = ${oldId}`);
    await db.update(favorites).set({ track: json as unknown as Track }).where(sql`${favorites.track}->>'externalId' = ${oldId}`);
    const sets = await db
      .select({ id: performances.id, setlist: performances.setlist, nowPlaying: performances.nowPlaying })
      .from(performances)
      .where(sql`${performances.setlist}::text like ${'%' + oldId + '%'} or ${performances.nowPlaying}::text like ${'%' + oldId + '%'}`);
    for (const p of sets) {
      await db
        .update(performances)
        .set({
          setlist: p.setlist.map((t) => (t.externalId === oldId ? track : t)),
          nowPlaying: p.nowPlaying?.track.externalId === oldId ? { ...p.nowPlaying, track } : p.nowPlaying,
        })
        .where(eq(performances.id, p.id));
    }
  }
}

export async function keepSampleCurrent(db: DB) {
  await repairSampleTracks(db);
  for (const [id, genres] of Object.entries(SAMPLE_HOUSE_SOUND)) {
    await db.update(venues).set({ musicGenres: genres }).where(and(eq(venues.id, id), sql`${venues.musicGenres} = '[]'::jsonb`));
  }
  await clearEarlyStarts(db);
  const [anchor] = await db.select({ wentLiveAt: performances.wentLiveAt }).from(performances).where(eq(performances.id, ANCHOR)).limit(1);
  if (anchor?.wentLiveAt) {
    const clock = anchor.wentLiveAt.getTime() + ANCHOR_STARTED_AGO;
    const delta = Date.now() - clock;
    if (delta > 30 * 60_000) await shiftSample(db, clock, delta);
  }
  await backfillHistory(db);
}

/** A set can only go live 2 hours before its slot; undo sets that were opened days early. */
async function clearEarlyStarts(db: DB) {
  await db
    .update(performances)
    .set({ wentLiveAt: null })
    .where(and(isNull(performances.endedAt), isNotNull(performances.wentLiveAt), sql`${performances.wentLiveAt} < ${performances.startsAt} - interval '2 hours'`));
}

/**
 * Tonight's sets and festivals keep their place relative to "now". Bookings further out keep their
 * weekday and time, and only move on a week once they'd otherwise slip into the past.
 */
async function shiftSample(db: DB, clock: number, delta: number) {
  const now = Date.now();
  const byFor = (startsAt: Date) => {
    if (startsAt.getTime() <= clock + 12 * H) return delta;
    if (startsAt.getTime() >= now + 12 * H) return 0;
    return Math.ceil((now + 12 * H - startsAt.getTime()) / (7 * D)) * 7 * D;
  };
  const since = new Date(clock - 12 * H);
  const sets = await db
    .select()
    .from(performances)
    .where(
      and(
        like(performances.id, 'pf\\_%'),
        notLike(performances.id, 'pf\\_hist\\_%'),
        gte(performances.startsAt, since),
        or(isNull(performances.endedAt), eq(performances.id, ANCHOR)),
      ),
    );
  for (const p of sets) {
    const by = p.id === ANCHOR ? delta : byFor(p.startsAt);
    if (!by) continue;
    const move = (d: Date | null) => (d ? new Date(d.getTime() + by) : d);
    await db
      .update(performances)
      .set({
        startsAt: move(p.startsAt)!,
        endsAt: move(p.endsAt)!,
        wentLiveAt: move(p.wentLiveAt),
        nowPlaying: p.nowPlaying ? { ...p.nowPlaying, startedAt: new Date(new Date(p.nowPlaying.startedAt).getTime() + by).toISOString() } : null,
      })
      .where(eq(performances.id, p.id));
  }
  const evs = await db
    .select({ id: events.id, startsAt: events.startsAt, endsAt: events.endsAt })
    .from(events)
    .where(and(like(events.id, 'e\\_%'), gte(events.startsAt, since)));
  for (const e of evs) {
    const by = byFor(e.startsAt);
    if (by) await db.update(events).set({ startsAt: new Date(e.startsAt.getTime() + by), endsAt: new Date(e.endsAt.getTime() + by) }).where(eq(events.id, e.id));
  }
}

/** Weekly residencies since the seed: each new night repeats the one four weeks earlier. */
async function backfillHistory(db: DB) {
  const existing = await db.select({ id: performances.id }).from(performances).where(like(performances.id, 'pf\\_hist\\_v\\_xoyo\\_%'));
  if (!existing.length) return;
  let week = Math.max(...existing.map((r) => Number(r.id.split('_').pop())));
  for (;;) {
    week += 1;
    const start = HISTORY_START + week * 7 * D;
    if (start + 6 * H > Date.now()) break;
    for (const [venueId, roster] of Object.entries(ROSTERS)) {
      const id = `pf_hist_${venueId}_${week}`;
      const source = `pf_hist_${venueId}_${week - 4}`;
      const [src] = await db.select().from(performances).where(eq(performances.id, source)).limit(1);
      if (!src) continue;
      const performerId = roster.performers[week % roster.performers.length];
      const startsAt = new Date(start + roster.offsetH * H);
      await db.insert(performances).values({
        id,
        title: src.title,
        performerId,
        venueId,
        basis: 'Recurring',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 4 * H),
        endedAt: new Date(startsAt.getTime() + 4 * H),
        crowdEstimate: Math.round(src.crowdEstimate * 1.02),
        setlist: [],
      });
      const shift = (d: Date | null) => (d ? new Date(d.getTime() + 28 * D) : d);
      const rows = await db.select().from(requests).where(eq(requests.performanceId, source));
      for (const r of rows) {
        const rid = newId();
        const createdAt = shift(r.createdAt)!;
        await db.insert(requests).values({ ...r, id: rid, performanceId: id, createdAt, decidedAt: shift(r.decidedAt), playedAt: shift(r.playedAt) });
        const share = Math.round(r.priceCents * 0.5);
        await db.insert(earnings).values([
          { id: newId(), requestId: rid, beneficiaryType: 'PERFORMER', beneficiaryId: performerId, amountCents: share, createdAt },
          { id: newId(), requestId: rid, beneficiaryType: 'VENUE', beneficiaryId: venueId, amountCents: r.priceCents - share, createdAt },
        ]);
      }
    }
  }
}
