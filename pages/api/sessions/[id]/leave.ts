import { route, requireUser, query } from '@/lib/server/http';
import { leaveSession } from '@/lib/server/services/sessions';

export default route({
  async POST(ctx) {
    return leaveSession(ctx.db, requireUser(ctx), query(ctx, 'id')!);
  },
});
