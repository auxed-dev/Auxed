import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { DB } from '../../db';
import { sampleDataEnabled } from '../../db';
import { performances } from '../../db/schema';
import { SET_OVERRUN_MS } from './core';
import { closePerformance } from './rooms';

declare global {
  // eslint-disable-next-line no-var
  var __auxedHousekeeping: { at: number; running: Promise<void> | null } | undefined;
}

/**
 * Sets nobody ended (and PASS THE AUX sessions past their window) are closed a few hours after
 * their slot, the same way "End set" does it, so unplayed requests are refunded instead of
 * sitting in a queue forever.
 */
export async function closeOverdueSets(db: DB) {
  const now = Date.now();
  const overdue = await db
    .select({ id: performances.id })
    .from(performances)
    .where(and(isNull(performances.endedAt), or(lt(performances.endsAt, new Date(now - SET_OVERRUN_MS)), and(eq(performances.kind, 'HOME'), lt(performances.endsAt, new Date(now))))))
    .limit(50);
  for (const p of overdue) await closePerformance(db, p.id);
  return overdue.length;
}

/**
 * Background upkeep, run from the API at most once a minute (no separate worker to deploy).
 * Requests that arrive while it runs wait for it, so they never see a half-updated state.
 */
export function housekeeping(db: DB): Promise<void> {
  const h = (globalThis.__auxedHousekeeping ??= { at: 0, running: null });
  if (h.running) return h.running;
  if (Date.now() - h.at < 60_000) return Promise.resolve();
  h.at = Date.now();
  h.running = (async () => {
    try {
      if (sampleDataEnabled()) {
        const { keepSampleCurrent } = await import('../../db/sampleClock');
        await keepSampleCurrent(db);
      }
      await closeOverdueSets(db);
    } catch (err) {
      console.error('[housekeeping]', err);
    } finally {
      h.running = null;
    }
  })();
  return h.running;
}
