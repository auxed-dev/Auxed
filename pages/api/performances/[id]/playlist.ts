import { route, query } from '@/lib/server/http';
import { requireRoomAccess } from '@/lib/server/services/rooms';
import { setPlaylist } from '@/lib/server/services/setPlays';

/** The set's playlist: what has played (in order), what's on now, and the approved requests up next. */
export default route({
  async GET(ctx) {
    const perf = await requireRoomAccess(ctx.db, query(ctx, 'id')!, ctx.user);
    return setPlaylist(ctx.db, perf);
  },
});
