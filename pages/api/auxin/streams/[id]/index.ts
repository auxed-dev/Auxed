import { route, body, requireUser, query, oneOf } from '@/lib/server/http';
import { broadcasterPoll, endStream } from '@/lib/server/services/auxin';

/** Broadcaster: poll for listeners (and keep the stream alive), or end it. */
export default route({
  async GET(ctx) {
    return broadcasterPoll(ctx.db, requireUser(ctx), query(ctx, 'id')!);
  },
  async PATCH(ctx) {
    oneOf(body(ctx).action, 'Action', ['end'] as const);
    return endStream(ctx.db, requireUser(ctx), query(ctx, 'id')!);
  },
});
