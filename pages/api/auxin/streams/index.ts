import { route, body, str } from '@/lib/server/http';
import { requireOwner } from '@/lib/server/guards';
import { startStream } from '@/lib/server/services/auxin';

/** Venue starts broadcasting its speaker feed. */
export default route({
  async POST(ctx) {
    const user = requireOwner(ctx);
    const b = body(ctx);
    return startStream(ctx.db, user, str(b.venueId, 'Venue', { max: 40 }), str(b.zone, 'Zone', { optional: true, max: 30 }) || 'Main floor');
  },
});
