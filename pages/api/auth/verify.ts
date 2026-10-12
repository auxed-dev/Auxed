import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { route, body, str, bad, requireUser, rateLimit } from '@/lib/server/http';
import { consumeToken, sendVerification } from '@/lib/server/accounts';

export default route({
  /** Confirm an email verification token. */
  async POST(ctx) {
    const b = body(ctx);
    if (b.resend) {
      const user = requireUser(ctx);
      rateLimit(`verify-resend:${user.id}`, 3, 60 * 60_000);
      if (user.emailVerifiedAt) return { ok: true, alreadyVerified: true };
      await sendVerification(ctx.db, ctx.req, user);
      return { ok: true };
    }
    const token = str(b.token, 'Token', { max: 200 });
    const userId = await consumeToken(ctx.db, token, 'VERIFY_EMAIL');
    if (!userId) throw bad('This verification link is invalid or has expired.');
    await ctx.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
    return { ok: true };
  },
});
