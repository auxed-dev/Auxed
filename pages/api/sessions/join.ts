import { route, body, requireUser, str, rateLimit } from '@/lib/server/http';
import { joinByCode } from '@/lib/server/services/sessions';

/** Join a PASS THE AUX session with its invite code. */
export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`join:${user.id}`, 20, 10 * 60_000);
    return joinByCode(ctx.db, user, str(body(ctx).code, 'Code', { min: 4, max: 12 }));
  },
});
