import { and, eq } from 'drizzle-orm';
import { performances } from '@/lib/db/schema';
import { route, body, query, str, safeUrl, bad, notFound } from '@/lib/server/http';
import { requirePerformer } from '@/lib/server/guards';
import { sanitizeTrack } from '@/lib/server/music';
import type { Track } from '@/lib/types';

/** Update a set's track list, title, caption or cover. */
export default route({
  async PUT(ctx) {
    const { performer } = await requirePerformer(ctx);
    const id = query(ctx, 'id')!;
    const set = (await ctx.db.select().from(performances).where(and(eq(performances.id, id), eq(performances.performerId, performer.id))).limit(1))[0];
    if (!set) throw notFound('Set not found.');
    const b = body(ctx);
    const patch: Partial<typeof performances.$inferInsert> = {};
    if (b.setlist !== undefined) {
      if (!Array.isArray(b.setlist) || b.setlist.length > 150) throw bad('A set can hold up to 150 tracks.');
      patch.setlist = b.setlist.map(sanitizeTrack).filter(Boolean) as Track[];
    }
    if (b.title !== undefined) patch.title = str(b.title, 'Title', { min: 1, max: 80 });
    if (b.caption !== undefined) patch.caption = str(b.caption, 'Caption', { optional: true, max: 500 }) || null;
    if (b.imageUrl !== undefined) patch.imageUrl = safeUrl(b.imageUrl, 'Cover');
    if (Object.keys(patch).length) await ctx.db.update(performances).set(patch).where(eq(performances.id, id));
    return { ok: true };
  },
});
