import { eq, and } from 'drizzle-orm';
import { venues } from '@/lib/db/schema';
import { route, body, str, num, notFound } from '@/lib/server/http';
import { requireOwner } from '@/lib/server/guards';
import { ownerAuxIn } from '@/lib/server/services/auxin';

/** Owner: AUX IN settings and numbers per venue. */
export default route({
  async GET(ctx) {
    return ownerAuxIn(ctx.db, requireOwner(ctx));
  },
  async PATCH(ctx) {
    const user = requireOwner(ctx);
    const b = body(ctx);
    const venueId = str(b.venueId, 'Venue', { max: 40 });
    const patch: Partial<typeof venues.$inferInsert> = {};
    if (b.enabled !== undefined) patch.auxInEnabled = b.enabled === true;
    if (b.dayPass !== undefined) patch.auxInDayPassCents = Math.round(num(b.dayPass, 'Day pass price', { min: 0, max: 500 }) * 100);
    if (b.memberCode !== undefined) patch.auxInMemberCode = str(b.memberCode, 'Member code', { optional: true, max: 40 }) || null;
    const rows = await ctx.db.update(venues).set(patch).where(and(eq(venues.id, venueId), eq(venues.ownerId, user.id))).returning({ id: venues.id });
    if (!rows.length) throw notFound('Venue not found.');
    return { ok: true };
  },
});
