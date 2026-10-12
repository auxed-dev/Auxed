import { route, num, query } from '@/lib/server/http';
import { venueHere } from '@/lib/server/services/discovery';

/**
 * Is the phone at a venue with a live set? Used by the Wire Room to switch from the social feed
 * to that venue's live chat. The location is only used for this lookup and never stored.
 */
export default route({
  async GET(ctx) {
    const lat = num(query(ctx, 'lat'), 'Latitude', { min: -90, max: 90 });
    const lng = num(query(ctx, 'lng'), 'Longitude', { min: -180, max: 180 });
    return { here: await venueHere(ctx.db, lat, lng, ctx.user?.id ?? null) };
  },
});
