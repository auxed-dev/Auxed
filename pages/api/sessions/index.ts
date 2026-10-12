import { route, body, requireUser, str, oneOf, num, rateLimit, safeUrl } from '@/lib/server/http';
import { createSession, mySessions, DEFAULT_HOME } from '@/lib/server/services/sessions';

/** PASS THE AUX sessions: list yours (GET) or start one (POST). */
export default route({
  async GET(ctx) {
    const user = requireUser(ctx);
    return { sessions: await mySessions(ctx.db, user.id) };
  },
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`session:${user.id}`, 10, 60 * 60_000);
    const b = body(ctx);
    const title = str(b.title, 'Session name', { min: 2, max: 60 });
    const visibility = oneOf(b.visibility ?? 'FRIENDS', 'Who can join', ['PUBLIC', 'FRIENDS', 'PRIVATE'] as const);
    const approval = oneOf(b.approval ?? DEFAULT_HOME.approval, 'Approval', ['AUTO', 'HOST'] as const);
    const perGuestLimit = num(b.perGuestLimit ?? DEFAULT_HOME.perGuestLimit, 'Songs per guest', { min: 1, max: 20, int: true });
    const source = str(b.source, 'Playing from', { optional: true, max: 40 }) || null;
    return createSession(ctx.db, user, { title, visibility, settings: { approval, perGuestLimit, source }, imageUrl: safeUrl(b.imageUrl, 'Cover') });
  },
});
