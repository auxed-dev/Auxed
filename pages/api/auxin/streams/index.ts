import { route, body, str, requireRole } from '@/lib/server/http';
import { startStream } from '@/lib/server/services/auxin';

/** The venue (or the DJ playing there now) starts broadcasting the speaker feed. */
export default route({
  async POST(ctx) {
    const user = requireRole(ctx, 'OWNER', 'PERFORMER');
    const b = body(ctx);
    return startStream(ctx.db, user, str(b.venueId, 'Venue', { max: 40 }), str(b.zone, 'Zone', { optional: true, max: 30 }) || 'Main floor');
  },
});
