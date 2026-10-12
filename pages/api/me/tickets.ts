import { route, requireUser } from '@/lib/server/http';
import { userTickets } from '@/lib/server/services/discovery';

export default route({
  async GET(ctx) {
    const user = requireUser(ctx);
    return { tickets: await userTickets(ctx.db, user.id) };
  },
});
