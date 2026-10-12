import { route, requireUser } from '@/lib/server/http';
import { spotifyPlayerToken } from '@/lib/server/musicConnect';

/** The signed-in person's own Spotify token, for the AUXED Player's Web Playback SDK speaker. */
export default route({
  async GET(ctx) {
    return spotifyPlayerToken(ctx.db, requireUser(ctx).id);
  },
});
