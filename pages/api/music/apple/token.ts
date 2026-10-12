import { route, requireUser } from '@/lib/server/http';
import { appleMusicDeveloperToken } from '@/lib/server/musicConnect';

/** MusicKit developer token for the browser (Apple Music sign-in and the AUXED Player). */
export default route({
  GET(ctx) {
    requireUser(ctx);
    return { developerToken: appleMusicDeveloperToken(), storefront: (process.env.MUSIC_COUNTRY || 'za').toLowerCase() };
  },
});
