import { and, eq, inArray, like, sql } from 'drizzle-orm';
import type { DB } from './index';
import { sampleDataEnabled } from './index';
import { performances, performers, requests, users } from './schema';
import { T } from './catalog';
import { songPriceCents } from '../pricing';
import { DEFAULT_CONTROLS } from '../server/services/core';
import { newId } from '../server/crypto';

const lastTick = new Map<string, number>();

/**
 * Sample-data only: keeps live sample sets feeling alive by having the sample crowd drop the odd
 * request when a queue runs low. Never runs when sample data is off (production).
 */
export async function sampleCrowdTick(db: DB, perf: typeof performances.$inferSelect) {
  if (!sampleDataEnabled() || perf.kind !== 'SET' || !perf.performerId || !perf.wentLiveAt || perf.endedAt) return;
  const now = Date.now();
  if (now - (lastTick.get(perf.id) ?? 0) < 40_000) return;
  lastTick.set(perf.id, now);
  const active = await db
    .select({ title: sql<string>`${requests.track}->>'title'` })
    .from(requests)
    .where(and(eq(requests.performanceId, perf.id), inArray(requests.status, ['PENDING', 'QUEUED', 'PLAYING'])));
  if (active.length >= 4) return;
  const crowd = await db.select({ id: users.id }).from(users).where(like(users.id, 'u_c%')).limit(60);
  if (!crowd.length) return;
  const performerId = perf.performerId;
  const pf = (await db.select({ controls: performers.controls }).from(performers).where(eq(performers.id, performerId)).limit(1))[0];
  const controls = pf?.controls ?? DEFAULT_CONTROLS;
  const taken = new Set(active.map((a) => a.title));
  const pool = Object.values(T).filter((t) => !taken.has(t.title) && t.durationSec <= controls.maxSongLength * 60);
  const adds = Math.min(2, 4 - active.length);
  for (let i = 0; i < adds && pool.length; i++) {
    const track = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const up = Math.round(Math.pow(Math.random(), 2) * 30000);
    await db.insert(requests).values({
      id: newId(),
      performanceId: perf.id,
      userId: crowd[Math.floor(Math.random() * crowd.length)].id,
      kind: 'SONG',
      track,
      priceCents: songPriceCents(track, controls),
      status: 'QUEUED',
      decidedAt: new Date(),
      baseUp: up,
      baseDown: Math.round(up * Math.random() * 0.02),
      reactionBase: { '🔥': Math.round(up * 0.18), '🙌': Math.round(up * 0.04), '💪': Math.round(up * 0.001) },
    });
  }
}
