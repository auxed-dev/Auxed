import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { route, body, str, rateLimit, HttpError } from '@/lib/server/http';
import { hashPassword, verifyPassword } from '@/lib/server/crypto';
import { createSession } from '@/lib/server/session';
import { homeFor } from '@/lib/server/accounts';

let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hashPassword('not-a-real-password-0'));

export default route({
  async POST(ctx) {
    const b = body(ctx);
    const email = str(b.email, 'Email', { max: 254 }).toLowerCase();
    const password = str(b.password, 'Password', { max: 200 });
    rateLimit(`login:${ctx.ip}`, 20, 15 * 60_000);
    rateLimit(`login:${email}`, 8, 15 * 60_000);
    const user = (await ctx.db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    // Always run a hash so unknown emails take as long as wrong passwords.
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
    if (!user || !ok) throw new HttpError(401, 'That email and password combination is not right.', 'BAD_CREDENTIALS');
    await createSession(ctx.db, user.id, ctx.req, ctx.res);
    return { redirect: homeFor(user.role) };
  },
});
