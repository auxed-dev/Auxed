import { and, eq, or } from 'drizzle-orm';
import { friendships, users } from '@/lib/db/schema';
import { route, body, requireUser, str, bad, notFound, rateLimit } from '@/lib/server/http';
import { friendsOf } from '@/lib/server/services/discovery';

export default route({
  async GET(ctx) {
    const user = requireUser(ctx);
    return { friends: await friendsOf(ctx.db, user.id) };
  },
  /** Send a friend request by username (accepts automatically if they already asked you). */
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`friend:${user.id}`, 30, 60 * 60_000);
    const name = str(body(ctx).userName, 'Username', { max: 40 }).replace(/^@/, '');
    const other = (await ctx.db.select().from(users).where(eq(users.userNameKey, name.toLowerCase())).limit(1))[0];
    if (!other) throw notFound(`No AUXee called @${name}.`);
    if (other.id === user.id) throw bad('That is you!');
    const existing = await ctx.db
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, other.id)),
          and(eq(friendships.requesterId, other.id), eq(friendships.addresseeId, user.id)),
        ),
      )
      .limit(1);
    if (existing[0]) {
      if (existing[0].status === 'PENDING' && existing[0].requesterId === other.id) {
        await ctx.db
          .update(friendships)
          .set({ status: 'ACCEPTED' })
          .where(and(eq(friendships.requesterId, other.id), eq(friendships.addresseeId, user.id)));
        return { status: 'ACCEPTED' };
      }
      return { status: existing[0].status };
    }
    await ctx.db.insert(friendships).values({ requesterId: user.id, addresseeId: other.id, status: 'PENDING' });
    return { status: 'PENDING' };
  },
});
