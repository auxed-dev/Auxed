import { and, eq } from 'drizzle-orm';
import { venues } from '@/lib/db/schema';
import { route, body, query, notFound } from '@/lib/server/http';
import { requireOwner } from '@/lib/server/guards';
import { venueDTO } from '@/lib/server/services/core';
import { venueInput } from '@/lib/server/venueInput';

export default route({
  async PATCH(ctx) {
    const user = requireOwner(ctx);
    const id = query(ctx, 'id')!;
    const patch = venueInput(body(ctx), true);
    const rows = await ctx.db
      .update(venues)
      .set(patch)
      .where(and(eq(venues.id, id), eq(venues.ownerId, user.id)))
      .returning();
    if (!rows[0]) throw notFound('Venue not found.');
    return { venue: venueDTO(rows[0]) };
  },
});
