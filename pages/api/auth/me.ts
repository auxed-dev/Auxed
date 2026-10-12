import { route } from '@/lib/server/http';
import { toSessionUser } from '@/lib/server/session';

export default route({
  GET(ctx) {
    return { user: ctx.user ? toSessionUser(ctx.user) : null };
  },
});
