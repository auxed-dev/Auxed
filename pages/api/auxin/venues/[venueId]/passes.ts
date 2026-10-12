import { route, body, requireUser, query, oneOf, str, rateLimit } from '@/lib/server/http';
import { buyPass } from '@/lib/server/services/auxin';

/** Get a Day Pass, the monthly Aux Pass, or claim the member perk with a code. */
export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`auxpass:${user.id}`, 10, 10 * 60_000);
    const b = body(ctx);
    return buyPass(ctx.db, user, query(ctx, 'venueId')!, oneOf(b.kind, 'Pass', ['DAY', 'MONTH', 'MEMBER'] as const), b.code ? str(b.code, 'Code', { max: 40 }) : null);
  },
});
