import { route, query, rateLimit, HttpError } from '@/lib/server/http';
import { searchTracks } from '@/lib/server/music';

export default route({
  async GET(ctx) {
    rateLimit(`music:${ctx.user?.id ?? ctx.ip}`, 40, 60_000);
    const q = (query(ctx, 'q') ?? '').trim();
    if (q.length < 2) return { tracks: [] };
    try {
      return { tracks: await searchTracks(q, 20) };
    } catch (err) {
      console.error('[music] search failed', err);
      throw new HttpError(502, 'Song search is unavailable right now. Try again in a moment.');
    }
  },
});
