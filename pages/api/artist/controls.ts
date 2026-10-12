import { eq } from 'drizzle-orm';
import { performers } from '@/lib/db/schema';
import { route, body, num, oneOf, str, bad } from '@/lib/server/http';
import { requirePerformer } from '@/lib/server/guards';
import { DEFAULT_CONTROLS } from '@/lib/server/services/core';
import type { CreativeControls } from '@/lib/types';

const INTEGRATIONS = ['apple-music', 'spotify', 'soundcloud', 'youtube-music', 'virtual-dj', 'pioneer-dj', 'tiktok', 'radio', 'files', 'google-drive'];

export default route({
  async GET(ctx) {
    const { performer } = await requirePerformer(ctx);
    return { controls: performer.controls ?? DEFAULT_CONTROLS, integrations: INTEGRATIONS };
  },
  /** Save "My Creative Controls". */
  async PUT(ctx) {
    const { performer } = await requirePerformer(ctx);
    const current = performer.controls ?? DEFAULT_CONTROLS;
    const b = body<Partial<CreativeControls>>(ctx);
    const genres = Array.isArray(b.genres) ? b.genres : [];
    if (genres.length > 8) throw bad('Pick up to 8 genres.');
    const controls: CreativeControls = {
      requestIntake: num(b.requestIntake, 'Request intake', { min: 0, max: 50, int: true }),
      genres: genres.map((g, i) => ({
        name: str(g?.name, `Genre ${i + 1}`, { max: 30 }),
        weight: num(g?.weight, `Genre ${i + 1} weight`, { min: 0, max: 100 }),
      })),
      maxSongLength: num(b.maxSongLength, 'Song length', { min: 1, max: 15 }),
      // Request rates are set by AUXED, not the artist: keep whatever is stored.
      ratePerMinShort: current.ratePerMinShort,
      ratePerMinLong: current.ratePerMinLong,
      micPrice: num(b.micPrice, 'On The Mic price', { min: 1, max: 1000 }),
      mic: oneOf(b.mic, 'On The Mic', ['NO', 'YES', 'YES_PLUS'] as const),
      micFilters: (Array.isArray(b.micFilters) ? b.micFilters : []).slice(0, 50).map((w) => String(w).trim().slice(0, 40)).filter(Boolean),
      leadTime: oneOf(b.leadTime, 'Request lead time', ['LIVE', '24', '48', '36'] as const),
      integrations: (Array.isArray(b.integrations) ? b.integrations : []).filter((i) => INTEGRATIONS.includes(String(i))).map(String),
    };
    await ctx.db.update(performers).set({ controls }).where(eq(performers.id, performer.id));
    return { controls };
  },
});
