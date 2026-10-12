import { route, body, requireUser, query, oneOf, str } from '@/lib/server/http';
import { sanitizeTrack } from '@/lib/server/music';
import { playerEvent, playerQueue } from '@/lib/server/services/playback';

/** AUXED Player: what to play next (GET) and started / ended reports (POST). */
export default route({
  async GET(ctx) {
    return playerQueue(ctx.db, requireUser(ctx), query(ctx, 'id')!);
  },
  async POST(ctx) {
    const b = body(ctx);
    return playerEvent(ctx.db, requireUser(ctx), query(ctx, 'id')!, {
      event: oneOf(b.event, 'Event', ['started', 'ended', 'device'] as const),
      requestId: b.requestId ? str(b.requestId, 'Request', { max: 40 }) : null,
      track: b.track ? sanitizeTrack(b.track) : null,
      deviceId: b.deviceId ? str(b.deviceId, 'Device', { max: 100 }) : null,
    });
  },
});
