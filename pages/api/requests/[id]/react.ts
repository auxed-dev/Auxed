import { route, body, requireUser, query, str, rateLimit } from '@/lib/server/http';
import { reactRequest } from '@/lib/server/services/rooms';

export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`react:${user.id}`, 120, 60_000);
    return reactRequest(ctx.db, user, query(ctx, 'id')!, str(body(ctx).emoji, 'Emoji', { max: 8 }));
  },
});
