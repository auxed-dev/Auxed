import { route, body, requireUser, query, bad, rateLimit } from '@/lib/server/http';
import { voteRequest } from '@/lib/server/services/rooms';

export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`vote:${user.id}`, 120, 60_000);
    const value = Number(body(ctx).value);
    if (value !== 1 && value !== -1) throw bad('Vote must be 1 or -1.');
    return voteRequest(ctx.db, user, query(ctx, 'id')!, value);
  },
});
