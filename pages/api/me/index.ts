import { and, eq, ne } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { route, body, requireUser, str, safeUrl, bad, HttpError } from '@/lib/server/http';
import { USERNAME_RE } from '@/lib/server/accounts';
import { verifyPassword } from '@/lib/server/crypto';
import { destroySession, toSessionUser } from '@/lib/server/session';

export default route({
  GET(ctx) {
    return { user: toSessionUser(requireUser(ctx)) };
  },
  /** Update profile: username, avatar, ring colour. */
  async PATCH(ctx) {
    const user = requireUser(ctx);
    const b = body(ctx);
    const patch: Partial<typeof users.$inferInsert> = {};
    if (b.userName !== undefined) {
      const userName = str(b.userName, 'Username', { min: 3, max: 24 });
      if (!USERNAME_RE.test(userName)) throw bad('Username must be 3-24 letters, numbers, dots or underscores.');
      const taken = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.userNameKey, userName.toLowerCase()), ne(users.id, user.id)))
        .limit(1);
      if (taken[0]) throw new HttpError(409, 'That username is taken.');
      patch.userName = userName;
      patch.userNameKey = userName.toLowerCase();
    }
    if (b.avatarUrl !== undefined) patch.avatarUrl = safeUrl(b.avatarUrl, 'Avatar');
    if (b.ring !== undefined) {
      const ring = str(b.ring, 'Ring colour', { optional: true, max: 9 });
      if (ring && !/^#[0-9A-Fa-f]{6}$/.test(ring)) throw bad('Ring colour must be a hex colour.');
      patch.ring = ring || null;
    }
    if (Object.keys(patch).length) await ctx.db.update(users).set(patch).where(eq(users.id, user.id));
    const fresh = (await ctx.db.select().from(users).where(eq(users.id, user.id)))[0];
    return { user: toSessionUser({ ...fresh, performerId: user.performerId }) };
  },
  /** Permanently delete the account (POPIA/GDPR). Password accounts must confirm their password. */
  async DELETE(ctx) {
    const user = requireUser(ctx);
    if (user.passwordHash) {
      const ok = await verifyPassword(str(body(ctx).password, 'Password'), user.passwordHash);
      if (!ok) throw new HttpError(401, 'Password is not right.');
    }
    await destroySession(ctx.db, ctx.req, ctx.res);
    await ctx.db.delete(users).where(eq(users.id, user.id));
    return { ok: true };
  },
});
