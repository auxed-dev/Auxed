import { route, requireUser, query } from '@/lib/server/http';
import { viewStory } from '@/lib/server/services/stories';

export default route({
  async POST(ctx) {
    return viewStory(ctx.db, requireUser(ctx).id, query(ctx, 'id')!);
  },
});
