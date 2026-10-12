import { asc, eq } from 'drizzle-orm';
import { venues } from '@/lib/db/schema';
import { route, body } from '@/lib/server/http';
import { newId } from '@/lib/server/crypto';
import { requireOwner } from '@/lib/server/guards';
import { venueDTO } from '@/lib/server/services/core';
import { venueInput } from '@/lib/server/venueInput';

export default route({
  async GET(ctx) {
    const user = requireOwner(ctx);
    const rows = await ctx.db.select().from(venues).where(eq(venues.ownerId, user.id)).orderBy(asc(venues.name));
    return { venues: rows.map(venueDTO) };
  },
  /** Register an establishment. */
  async POST(ctx) {
    const user = requireOwner(ctx);
    const data = venueInput(body(ctx));
    const id = newId();
    await ctx.db.insert(venues).values({ ...(data as typeof venues.$inferInsert), id, ownerId: user.id });
    return { id };
  },
});
