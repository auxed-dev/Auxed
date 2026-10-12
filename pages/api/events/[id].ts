import { eq } from 'drizzle-orm';
import { events } from '@/lib/db/schema';
import { route, query, notFound } from '@/lib/server/http';
import { eventDTO } from '@/lib/server/services/core';

export default route({
  async GET(ctx) {
    const ev = (await ctx.db.select().from(events).where(eq(events.id, query(ctx, 'id')!)).limit(1))[0];
    if (!ev) throw notFound('Event not found.');
    return { event: await eventDTO(ctx.db, ev, ctx.user?.id ?? null) };
  },
});
