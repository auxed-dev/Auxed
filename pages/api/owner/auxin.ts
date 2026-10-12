import { eq, and } from 'drizzle-orm';
import { venues } from '@/lib/db/schema';
import { route, body, str, num, notFound, requireRole } from '@/lib/server/http';
import { requireOwner } from '@/lib/server/guards';
import { ownerAuxIn } from '@/lib/server/services/auxin';

/** AUX IN per venue: owners see settings and numbers; the DJ playing at a venue can broadcast it. */
export default route({
  async GET(ctx) {
    return ownerAuxIn(ctx.db, requireRole(ctx, 'OWNER', 'PERFORMER'));
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
