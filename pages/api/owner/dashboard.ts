import { route, query } from '@/lib/server/http';
import { requireOwner } from '@/lib/server/guards';
import { ownerDashboard, type Period } from '@/lib/server/services/dashboards';

export default route({
  async GET(ctx) {
    const user = requireOwner(ctx);
    const p = query(ctx, 'period');
    const period: Period = p === 'daily' || p === 'weekly' || p === 'yearly' ? p : 'monthly';
    return ownerDashboard(ctx.db, user.id, user.id, period, query(ctx, 'venueId') || undefined);
  },
});
