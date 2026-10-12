import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { route, body, str, rateLimit } from '@/lib/server/http';
import { sendPasswordReset } from '@/lib/server/accounts';

export default route({
  async POST(ctx) {
    const email = str(body(ctx).email, 'Email', { max: 254 }).toLowerCase();
    rateLimit(`forgot:${ctx.ip}`, 5, 15 * 60_000);
    rateLimit(`forgot:${email}`, 3, 60 * 60_000);
    const user = (await ctx.db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    if (user) await sendPasswordReset(ctx.db, ctx.req, user);
    // Same response either way so accounts can't be enumerated.
    return { ok: true };
  },
});
