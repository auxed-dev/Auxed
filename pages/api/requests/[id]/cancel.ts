import { route, requireUser, query } from '@/lib/server/http';
import { cancelRequest } from '@/lib/server/services/nightOut';

/** Undo your own request within 30 seconds (full refund). */
export default route({
  async POST(ctx) {
    return cancelRequest(ctx.db, requireUser(ctx), query(ctx, 'id')!);
  },
});
