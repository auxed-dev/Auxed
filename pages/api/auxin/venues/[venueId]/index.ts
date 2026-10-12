import { route, query, num } from '@/lib/server/http';
import { venueAuxInfo } from '@/lib/server/services/auxin';

/** AUX IN status for a venue (is the feed live, do I have a pass, am I on site). */
export default route({
  async GET(ctx) {
    const lat = query(ctx, 'lat');
    const lng = query(ctx, 'lng');
    return venueAuxInfo(
      ctx.db,
      ctx.user,
      query(ctx, 'venueId')!,
      lat ? num(lat, 'Latitude', { min: -90, max: 90 }) : null,
      lng ? num(lng, 'Longitude', { min: -180, max: 180 }) : null,
    );
  },
});
