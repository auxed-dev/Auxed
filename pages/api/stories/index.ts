import { route, body, requireUser, oneOf, str, safeUrl, rateLimit } from '@/lib/server/http';
import { createStory, listStories } from '@/lib/server/services/stories';
import { ensureSampleSocial } from '@/lib/db/sampleSocial';

/** Stories rail for the Wire Room (GET) and posting a story as a DJ or venue (POST). */
export default route({
  async GET(ctx) {
    await ensureSampleSocial(ctx.db);
    return { groups: await listStories(ctx.db, ctx.user?.id ?? null) };
  },
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`story:${user.id}`, 30, 60 * 60_000);
    const b = body(ctx);
    return createStory(ctx.db, user, {
      kind: oneOf(b.kind, 'Story type', ['SET', 'REQUEST', 'PHOTO', 'TEXT'] as const),
      performanceId: b.performanceId ? str(b.performanceId, 'Set', { max: 40 }) : null,
      requestId: b.requestId ? str(b.requestId, 'Request', { max: 40 }) : null,
      imageUrl: safeUrl(b.imageUrl, 'Photo'),
      text: str(b.text, 'Text', { optional: true, max: 200 }) || null,
    });
  },
});
