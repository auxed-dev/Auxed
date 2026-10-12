import { route, body, requireUser, query, oneOf } from '@/lib/server/http';
import { controlPerformance } from '@/lib/server/services/rooms';

/** Artist/venue controls for a set: go live, skip the current track, end the set. */
export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    const action = oneOf(body(ctx).action, 'Action', ['golive', 'end', 'skip'] as const);
    return controlPerformance(ctx.db, user, query(ctx, 'id')!, action);
  },
});
