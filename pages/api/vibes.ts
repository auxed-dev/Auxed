import { route } from '@/lib/server/http';
import { vibes } from '@/lib/server/services/discovery';

export default route({
  async GET(ctx) {
    return vibes(ctx.db, ctx.user?.id ?? null);
  },
});
