import { route, requireUser, query } from '@/lib/server/http';
import { checkIn } from '@/lib/server/services/auxin';

/** Opening the venue's door QR checks you in for a few hours (used by AUX IN's on-site check). */
export default route({
  async POST(ctx) {
    return checkIn(ctx.db, requireUser(ctx).id, query(ctx, 'id')!);
  },
});
