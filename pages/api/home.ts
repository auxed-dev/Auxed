import { route } from '@/lib/server/http';
import { homeFeed } from '@/lib/server/services/discovery';

export default route({
  async GET(ctx) {
    return homeFeed(ctx.db, ctx.user?.id ?? null);
  },
});
