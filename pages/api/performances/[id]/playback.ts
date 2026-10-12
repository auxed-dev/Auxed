import { route, body, requireUser, query, oneOf } from '@/lib/server/http';
import { setPlayback } from '@/lib/server/services/playback';

/** Choose where approved requests auto-queue: SPOTIFY, APPLE_MUSIC, YOUTUBE or null (off). */
export default route({
  async PUT(ctx) {
    const user = requireUser(ctx);
    const v = body(ctx).provider;
    const provider = v === null || v === 'OFF' ? null : oneOf(v, 'Playback', ['SPOTIFY', 'APPLE_MUSIC', 'YOUTUBE'] as const);
    return setPlayback(ctx.db, user, query(ctx, 'id')!, provider);
  },
});
