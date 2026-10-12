import { route, body, requireUser, query, oneOf, str, rateLimit } from '@/lib/server/http';
import { sanitizeTrack } from '@/lib/server/music';
import { createRequest } from '@/lib/server/services/rooms';

/** Make a song or On The Mic request into a set. The price is debited from the token wallet. */
export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`request:${user.id}`, 20, 10 * 60_000);
    const b = body(ctx);
    const kind = oneOf(b.kind, 'Request type', ['SONG', 'MIC'] as const);
    const track = b.track ? sanitizeTrack(b.track) : null;
    const message = str(b.message, 'Message', { optional: true, max: 200 });
    return createRequest(ctx.db, user, query(ctx, 'id')!, { kind, track, message });
  },
});
