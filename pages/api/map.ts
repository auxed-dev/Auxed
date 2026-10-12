import { route } from '@/lib/server/http';
import { mapData } from '@/lib/server/services/discovery';

export default route({
  async GET(ctx) {
    return mapData(ctx.db, ctx.user?.id ?? null);
  },
});
