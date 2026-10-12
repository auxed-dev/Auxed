import { route, query } from '@/lib/server/http';
import { requirePerformer } from '@/lib/server/guards';
import { artistDashboard } from '@/lib/server/services/dashboards';
import { advancePlayback } from '@/lib/server/services/rooms';
import { and, eq, isNull } from 'drizzle-orm';
import { performances } from '@/lib/db/schema';

export default route({
  async GET(ctx) {
    const { user, performer } = await requirePerformer(ctx);
    // Keep "now playing" moving for the artist's live sets while they watch the dashboard.
    const open = await ctx.db.select().from(performances).where(and(eq(performances.performerId, performer.id), isNull(performances.endedAt)));
    for (const p of open) await advancePlayback(ctx.db, p);
    return artistDashboard(ctx.db, performer.id, user.id, query(ctx, 'venueId') || undefined);
  },
});
