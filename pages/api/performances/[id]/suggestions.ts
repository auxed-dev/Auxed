import { route, query, rateLimit } from '@/lib/server/http';
import { requireRoomAccess } from '@/lib/server/services/rooms';
import { suggestions } from '@/lib/server/services/nightOut';
import { loadPerformance, DEFAULT_CONTROLS, publicControls } from '@/lib/server/services/core';
import { HOME_CONTROLS } from '@/lib/server/services/sessions';

/** Top 10 quick-request picks for this set, tailored to the viewer. */
export default route({
  async GET(ctx) {
    rateLimit(`suggest:${ctx.user?.id ?? ctx.ip}`, 60, 60_000);
    const id = query(ctx, 'id')!;
    const raw = await requireRoomAccess(ctx.db, id, ctx.user);
    if (raw.kind === 'HOME') return { picks: await suggestions(ctx.db, raw, HOME_CONTROLS, ctx.user?.id ?? null, true) };
    const row = await loadPerformance(ctx.db, id);
    const controls = publicControls(row?.pf.controls ?? DEFAULT_CONTROLS);
    return { picks: await suggestions(ctx.db, raw, controls, ctx.user?.id ?? null, false) };
  },
});
