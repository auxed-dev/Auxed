import { route, query, rateLimit, HttpError } from '@/lib/server/http';
import type { Track } from '@/lib/types';
import { searchAllCatalogues } from '@/lib/server/songSearch';
import { looksLikeSongLink, resolveSongLink } from '@/lib/server/songLinks';

export default route({
  async GET(ctx) {
    rateLimit(`music:${ctx.user?.id ?? ctx.ip}`, 40, 60_000);
    const q = (query(ctx, 'q') ?? '').trim();
    if (q.length < 2) return { tracks: [] };
    try {
      // A pasted song link from another service: find that song.
      if (looksLikeSongLink(q)) return { tracks: await resolveSongLink(q.slice(0, 500)) };
      return { tracks: (await searchAllCatalogues(q, 30)).map(({ popularity: _p, ...t }: Track & { popularity?: number }) => t) };
    } catch (err) {
      console.error('[music] search failed', err);
      throw new HttpError(502, 'Song search is unavailable right now. Try again in a moment.');
    }
  },
});
