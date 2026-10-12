import { route, body, requireUser, query, str, rateLimit } from '@/lib/server/http';
import { createPost } from '@/lib/server/services/rooms';

/** One-tap reaction / quick line about the song that's playing (posts into the set's chat). */
export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`reactnow:${user.id}`, 30, 60_000);
    const text = str(body(ctx).text, 'Reaction', { min: 1, max: 80 });
    return createPost(ctx.db, user, { kind: 'CHAT', performanceId: query(ctx, 'id')!, text });
  },
});
