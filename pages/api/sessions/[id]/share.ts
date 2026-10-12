import { route, body, requireUser, query, str, oneOf, rateLimit } from '@/lib/server/http';
import { shareSession } from '@/lib/server/services/sessions';

/** Share a session to the Wire Room as a card friends can tap to join. */
export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`share:${user.id}`, 20, 60 * 60_000);
    const b = body(ctx);
    return shareSession(
      ctx.db,
      user,
      query(ctx, 'id')!,
      str(b.text, 'Message', { optional: true, max: 300 }),
      b.visibility !== undefined ? oneOf(b.visibility, 'Who can join', ['PUBLIC', 'FRIENDS', 'PRIVATE'] as const) : undefined,
    );
  },
});
