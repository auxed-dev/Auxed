import { route, body, HttpError } from '@/lib/server/http';
import { sampleDataEnabled } from '@/lib/db';
import { applyMockHistory } from '@/lib/db/mockAccounts';

/** Development only: give registered test accounts realistic history. Disabled in production. */
export default route({
  async POST(ctx) {
    if (process.env.NODE_ENV === 'production' || !sampleDataEnabled()) throw new HttpError(404, 'Not found.');
    const emails = body<{ emails?: unknown }>(ctx).emails;
    if (!Array.isArray(emails) || !emails.length || emails.length > 10) throw new HttpError(400, 'Pass up to 10 emails.');
    const results = [];
    for (const e of emails) results.push(await applyMockHistory(ctx.db, String(e)));
    return { results };
  },
});
