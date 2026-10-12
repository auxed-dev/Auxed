import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { route, body, str, bad, rateLimit } from '@/lib/server/http';
import { consumeToken, validatePassword } from '@/lib/server/accounts';
import { hashPassword } from '@/lib/server/crypto';
import { createSession, destroyAllSessions } from '@/lib/server/session';

export default route({
  async POST(ctx) {
    rateLimit(`reset:${ctx.ip}`, 10, 15 * 60_000);
    const b = body(ctx);
    const token = str(b.token, 'Token', { max: 200 });
    const password = str(b.password, 'Password', { max: 200 });
    validatePassword(password);
    const userId = await consumeToken(ctx.db, token, 'RESET_PASSWORD');
    if (!userId) throw bad('This reset link is invalid or has expired. Request a new one.');
    await ctx.db.update(users).set({ passwordHash: await hashPassword(password), emailVerifiedAt: new Date() }).where(eq(users.id, userId));
    await destroyAllSessions(ctx.db, userId);
    await createSession(ctx.db, userId, ctx.req, ctx.res);
    return { ok: true };
  },
});
