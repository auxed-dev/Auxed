import { route, requireUser, query } from '@/lib/server/http';
import { removeMember } from '@/lib/server/services/sessions';

/** Host removes someone from the session (their waiting songs are dropped). */
export default route({
  async DELETE(ctx) {
    return removeMember(ctx.db, requireUser(ctx), query(ctx, 'id')!, query(ctx, 'userId')!);
  },
});
