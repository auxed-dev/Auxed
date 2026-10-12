import { route, requireUser, query } from '@/lib/server/http';
import { deleteStory } from '@/lib/server/services/stories';

export default route({
  async DELETE(ctx) {
    return deleteStory(ctx.db, requireUser(ctx), query(ctx, 'id')!);
  },
});
