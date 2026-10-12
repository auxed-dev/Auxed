import { route, body, requireUser, query, sdp, num, rateLimit } from '@/lib/server/http';
import { joinStream } from '@/lib/server/services/auxin';

/** Listener sends a WebRTC offer to the venue broadcaster. */
export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`auxjoin:${user.id}`, 20, 60_000);
    const b = body(ctx);
    return joinStream(
      ctx.db,
      user,
      query(ctx, 'id')!,
      sdp(b.offer, 'Offer'),
      b.lat !== undefined && b.lat !== null ? num(b.lat, 'Latitude', { min: -90, max: 90 }) : null,
      b.lng !== undefined && b.lng !== null ? num(b.lng, 'Longitude', { min: -180, max: 180 }) : null,
    );
  },
});
