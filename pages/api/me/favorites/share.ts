import { route, body, requireUser, str, rateLimit } from '@/lib/server/http';
import { sanitizeTrack } from '@/lib/server/music';
import { shareToFriend } from '@/lib/server/services/favorites';

/** Send a song or set to a friend's Treasure Box. */
export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`fshare:${user.id}`, 60, 60 * 60_000);
    const b = body(ctx);
    return shareToFriend(ctx.db, user, str(b.friendId, 'Friend', { max: 40 }), {
      track: b.track ? sanitizeTrack(b.track) : null,
      performanceId: b.performanceId ? str(b.performanceId, 'Set', { max: 40 }) : null,
      note: str(b.note, 'Note', { optional: true, max: 200 }) || null,
    });
  },
});
