import { route } from '@/lib/server/http';
import { destroySession } from '@/lib/server/session';

export default route({
  async POST(ctx) {
    await destroySession(ctx.db, ctx.req, ctx.res);
    return { ok: true };
  },
});
