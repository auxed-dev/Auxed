import { route, query } from '@/lib/server/http';
import { loadRoom } from '@/lib/server/services/rooms';

/** The room for a set: now playing, request queue, section chat and whether you can request. */
export default route({
  async GET(ctx) {
    return loadRoom(ctx.db, query(ctx, 'id')!, ctx.user);
  },
});
