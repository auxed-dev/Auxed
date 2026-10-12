import { route, body, str, oneOf, rateLimit } from '@/lib/server/http';
import { createAccount, sendVerification, validatePassword } from '@/lib/server/accounts';
import { createSession } from '@/lib/server/session';

export default route({
  async POST(ctx) {
    rateLimit(`signup:${ctx.ip}`, 10, 60 * 60_000);
    const b = body(ctx);
    const role = oneOf(b.role, 'Role', ['USER', 'PERFORMER', 'OWNER'] as const);
    const userName = str(b.userName, 'Username', { min: 3, max: 24 });
    const email = str(b.email, 'Email', { max: 254 });
    const password = str(b.password, 'Password', { max: 200 });
    validatePassword(password);
    const id = await createAccount(ctx.db, { userName, email, password, role });
    await sendVerification(ctx.db, ctx.req, { id, email: email.toLowerCase(), userName });
    await createSession(ctx.db, id, ctx.req, ctx.res);
    return { redirect: `/welcome?role=${role}` };
  },
});
