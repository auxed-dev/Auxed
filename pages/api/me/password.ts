import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { route, body, requireUser, str, rateLimit, HttpError } from '@/lib/server/http';
import { validatePassword } from '@/lib/server/accounts';
import { hashPassword, verifyPassword } from '@/lib/server/crypto';

export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`pw:${user.id}`, 6, 15 * 60_000);
    const b = body(ctx);
    const next = str(b.next, 'New password', { max: 200 });
    validatePassword(next);
    if (user.passwordHash && !(await verifyPassword(str(b.current, 'Current password'), user.passwordHash))) {
      throw new HttpError(401, 'Current password is not right.');
    }
    await ctx.db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id));
    return { ok: true };
  },
});
