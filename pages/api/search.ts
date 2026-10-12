import { route, query } from '@/lib/server/http';
import { search } from '@/lib/server/services/discovery';

export default route({
  async GET(ctx) {
    const q = (query(ctx, 'q') ?? '').trim().slice(0, 80);
    if (q.length < 2) return { venues: [], events: [], performers: [] };
    return search(ctx.db, q, ctx.user?.id ?? null);
  },
});
