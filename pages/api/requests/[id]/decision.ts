import { route, body, requireUser, query, oneOf } from '@/lib/server/http';
import { decideRequest } from '@/lib/server/services/rooms';

/** Artist or venue accepts (queues), declines (refunds) or plays a request now. */
export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    const action = oneOf(body(ctx).action, 'Action', ['approve', 'reject', 'play'] as const);
    return decideRequest(ctx.db, user, query(ctx, 'id')!, action);
  },
});
