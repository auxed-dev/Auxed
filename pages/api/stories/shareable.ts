import { route, requireUser } from '@/lib/server/http';
import { shareable } from '@/lib/server/services/stories';

/** Sets and request highlights you can share to your story. */
export default route({
  async GET(ctx) {
    return shareable(ctx.db, requireUser(ctx));
  },
});
