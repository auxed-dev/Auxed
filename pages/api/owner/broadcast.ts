import { route, body, str, rateLimit } from '@/lib/server/http';
import { requireOwner } from '@/lib/server/guards';
import { createPost } from '@/lib/server/services/rooms';

/** "Hear from Management": a management message into a set's chat or the Wire Room. */
export default route({
  async POST(ctx) {
    const user = requireOwner(ctx);
    rateLimit(`broadcast:${user.id}`, 20, 10 * 60_000);
    const b = body(ctx);
    return createPost(ctx.db, user, {
      kind: 'MANAGEMENT',
      performanceId: b.performanceId ? str(b.performanceId, 'Set', { max: 40 }) : null,
      text: str(b.text, 'Message', { min: 1, max: 300 }),
      label: b.label ? str(b.label, 'Label', { max: 40 }) : 'Management',
    });
  },
});
