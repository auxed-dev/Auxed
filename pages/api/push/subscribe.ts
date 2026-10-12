import { eq } from 'drizzle-orm';
import { pushSubscriptions } from '@/lib/db/schema';
import { route, body, requireUser, str, bad } from '@/lib/server/http';
import { requireRoomAccess } from '@/lib/server/services/rooms';

/**
 * Save this phone's push subscription. Pass livePerformanceId to show that set's "now playing"
 * card on the lock screen (null to stop), or omit it to keep the current one.
 */
export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    const b = body<{ subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; livePerformanceId?: string | null }>(ctx);
    const sub = b.subscription;
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw bad('Invalid push subscription.');
    const endpoint = str(sub.endpoint, 'Endpoint', { max: 1000 });
    if (!/^https:\/\//.test(endpoint)) throw bad('Invalid push endpoint.');
    let live: string | null | undefined = undefined;
    if (b.livePerformanceId !== undefined) {
      live = b.livePerformanceId ? str(b.livePerformanceId, 'Set', { max: 40 }) : null;
      if (live) await requireRoomAccess(ctx.db, live, user);
    }
    const values = { endpoint, userId: user.id, p256dh: str(sub.keys.p256dh, 'Key', { max: 200 }), auth: str(sub.keys.auth, 'Auth', { max: 100 }), ...(live !== undefined ? { livePerformanceId: live } : {}) };
    await ctx.db.insert(pushSubscriptions).values(values).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
    return { ok: true, livePerformanceId: live ?? null };
  },
  async DELETE(ctx) {
    requireUser(ctx);
    await ctx.db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, str(body(ctx).endpoint, 'Endpoint', { max: 1000 })));
    return { ok: true };
  },
});
