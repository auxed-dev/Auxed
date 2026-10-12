import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { route, body, requireUser, num, str } from '@/lib/server/http';

/** Share (or stop sharing) your location with accepted friends on the map. */
export default route({
  async PATCH(ctx) {
    const user = requireUser(ctx);
    const b = body(ctx);
    const share = b.share === true;
    const patch: Partial<typeof users.$inferInsert> = { shareLocation: share };
    if (share && b.lat !== undefined && b.lng !== undefined) {
      patch.lat = num(b.lat, 'Latitude', { min: -90, max: 90 });
      patch.lng = num(b.lng, 'Longitude', { min: -180, max: 180 });
      patch.locationUpdatedAt = new Date();
    }
    if (b.statusText !== undefined) patch.statusText = str(b.statusText, 'Status', { optional: true, max: 60 }) || null;
    if (!share) Object.assign(patch, { lat: null, lng: null, statusText: null });
    await ctx.db.update(users).set(patch).where(eq(users.id, user.id));
    return { ok: true, share };
  },
});
