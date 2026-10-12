import { and, ilike, ne } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { route, requireUser, query } from '@/lib/server/http';
import { userBrief } from '@/lib/server/services/core';

export default route({
  async GET(ctx) {
    const user = requireUser(ctx);
    const q = (query(ctx, 'q') ?? '').trim().replace(/[%_]/g, '').slice(0, 40);
    if (q.length < 2) return { users: [] };
    const rows = await ctx.db.select().from(users).where(and(ilike(users.userName, `%${q}%`), ne(users.id, user.id))).limit(10);
    return { users: rows.map(userBrief) };
  },
});
