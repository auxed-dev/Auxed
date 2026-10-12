import { nativePushTokens } from '@/lib/db/schema';
import { route, body, requireUser, str, oneOf } from '@/lib/server/http';
import { requireRoomAccess } from '@/lib/server/services/rooms';

/** Native app: register an APNs / FCM / Live Activity token (see native/README.md). */
export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    const b = body(ctx);
    const performanceId = b.performanceId ? str(b.performanceId, 'Set', { max: 40 }) : null;
    if (performanceId) await requireRoomAccess(ctx.db, performanceId, user);
    const values = {
      token: str(b.token, 'Token', { max: 300 }),
      userId: user.id,
      kind: oneOf(b.kind, 'Kind', ['IOS_LIVE_ACTIVITY_START', 'IOS_LIVE_ACTIVITY', 'IOS', 'ANDROID'] as const),
      performanceId,
    };
    await ctx.db.insert(nativePushTokens).values(values).onConflictDoUpdate({ target: nativePushTokens.token, set: values });
    return { ok: true };
  },
});
