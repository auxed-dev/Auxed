import { eq } from 'drizzle-orm';
import { performers } from '@/lib/db/schema';
import { route, body, str, oneOf, safeUrl, bad } from '@/lib/server/http';
import { requirePerformer } from '@/lib/server/guards';

/** Register / update the artist portfolio. */
export default route({
  async GET(ctx) {
    const { performer } = await requirePerformer(ctx);
    return { performer };
  },
  async PUT(ctx) {
    const { performer } = await requirePerformer(ctx);
    const b = body(ctx);
    const genres = Array.isArray(b.genres) ? b.genres.map((g) => String(g).trim().slice(0, 30)).filter(Boolean) : performer.genres;
    if (genres.length > 8) throw bad('Pick up to 8 genres.');
    const patch = {
      name: b.name !== undefined ? str(b.name, 'Artist name', { min: 2, max: 60 }) : performer.name,
      type: b.type !== undefined ? oneOf(b.type, 'Type', ['DJ', 'ARTIST'] as const) : performer.type,
      bio: b.bio !== undefined ? str(b.bio, 'Bio', { optional: true, max: 500 }) || null : performer.bio,
      imageUrl: b.imageUrl !== undefined ? safeUrl(b.imageUrl, 'Image') : performer.imageUrl,
      genres,
    };
    await ctx.db.update(performers).set(patch).where(eq(performers.id, performer.id));
    return { performer: { ...performer, ...patch } };
  },
});
