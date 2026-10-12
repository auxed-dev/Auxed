import { route, body, requireUser, query, str, bad } from '@/lib/server/http';
import { sanitizeTrack } from '@/lib/server/music';
import { favoriteKeys, listFavorites, removeFavorite, toggleFavoriteTrack } from '@/lib/server/services/favorites';

/** Treasure Box favourites. GET ?keys=1 returns just the saved-song keys (for hearts in rooms). */
export default route({
  async GET(ctx) {
    const user = requireUser(ctx);
    if (query(ctx, 'keys')) return { keys: await favoriteKeys(ctx.db, user.id) };
    return listFavorites(ctx.db, user.id);
  },
  /** Toggle a saved song. */
  async POST(ctx) {
    const user = requireUser(ctx);
    const b = body(ctx);
    const track = sanitizeTrack(b.track);
    if (!track) throw bad('Pick a song.');
    return toggleFavoriteTrack(ctx.db, user, track, b.performanceId ? str(b.performanceId, 'Set', { max: 40 }) : null);
  },
  async DELETE(ctx) {
    return removeFavorite(ctx.db, requireUser(ctx), str(query(ctx, 'id'), 'Favourite', { max: 40 }));
  },
});
