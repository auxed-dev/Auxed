import { route, requireUser, query, str, num, rateLimit } from '@/lib/server/http';
import { findOnItunes } from '@/lib/server/music';

/** A 30-second preview for any song (the matching recording in the Apple catalogue), to check it's the right one. */
export default route({
  async GET(ctx) {
    const user = requireUser(ctx);
    rateLimit(`preview:${user.id}`, 60, 60_000);
    const t = await findOnItunes({
      title: str(query(ctx, 'title'), 'Title', { max: 200 }),
      artist: str(query(ctx, 'artist'), 'Artist', { max: 200 }),
      durationSec: num(query(ctx, 'duration'), 'Duration', { min: 1, max: 3600 }),
    });
    return { previewUrl: t?.previewUrl ?? null };
  },
});
