import { eq } from 'drizzle-orm';
import { performances } from '@/lib/db/schema';
import { route, body, requireUser, query, str, oneOf, num } from '@/lib/server/http';
import { requireHost, settingsOf } from '@/lib/server/services/sessions';

/** Host settings: name, who can join, approval and per-guest limit. */
export default route({
  async PATCH(ctx) {
    const user = requireUser(ctx);
    const p = await requireHost(ctx.db, query(ctx, 'id')!, user);
    const b = body(ctx);
    const s = settingsOf(p);
    const patch: Partial<typeof performances.$inferInsert> = {
      homeSettings: {
        approval: b.approval !== undefined ? oneOf(b.approval, 'Approval', ['AUTO', 'HOST'] as const) : s.approval,
        perGuestLimit: b.perGuestLimit !== undefined ? num(b.perGuestLimit, 'Songs per guest', { min: 1, max: 20, int: true }) : s.perGuestLimit,
        source: b.source !== undefined ? str(b.source, 'Playing from', { optional: true, max: 40 }) || null : s.source,
      },
    };
    if (b.title !== undefined) patch.title = str(b.title, 'Session name', { min: 2, max: 60 });
    if (b.visibility !== undefined) patch.visibility = oneOf(b.visibility, 'Who can join', ['PUBLIC', 'FRIENDS', 'PRIVATE'] as const);
    await ctx.db.update(performances).set(patch).where(eq(performances.id, p.id));
    return { ok: true };
  },
});
