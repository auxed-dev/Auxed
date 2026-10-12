import { and, eq } from 'drizzle-orm';
import { musicConnections } from '@/lib/db/schema';
import { route, body, requireUser, oneOf, rateLimit, bad } from '@/lib/server/http';
import { sanitizeTrack } from '@/lib/server/music';
import { appleMusicEnabled, importSpotifyFavorites, replaceImported, spotifyEnabled, youtubeEnabled } from '@/lib/server/musicConnect';
import type { Track } from '@/lib/types';

/** Your linked music services (GET), re-import favourites (POST), unlink (DELETE). */
export default route({
  async GET(ctx) {
    const user = requireUser(ctx);
    const rows = await ctx.db.select().from(musicConnections).where(eq(musicConnections.userId, user.id));
    return {
      available: { spotify: spotifyEnabled(), appleMusic: appleMusicEnabled(), youtube: youtubeEnabled() },
      connections: rows.map((r) => ({ provider: r.provider, displayName: r.displayName, lastImportAt: r.lastImportAt?.toISOString() ?? null })),
    };
  },
  /** { provider: 'SPOTIFY' } re-imports from Spotify; { provider: 'APPLE_MUSIC', tracks } stores tracks the browser read via MusicKit. */
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`import:${user.id}`, 10, 60 * 60_000);
    const b = body(ctx);
    const provider = oneOf(b.provider, 'Service', ['SPOTIFY', 'APPLE_MUSIC'] as const);
    if (provider === 'SPOTIFY') return { imported: await importSpotifyFavorites(ctx.db, user.id) };
    if (!Array.isArray(b.tracks)) throw bad('No tracks to import.');
    const tracks = (b.tracks as unknown[]).slice(0, 100).map(sanitizeTrack).filter(Boolean) as Track[];
    await replaceImported(ctx.db, user.id, 'APPLE_MUSIC', tracks);
    const values = { userId: user.id, provider: 'APPLE_MUSIC' as const, displayName: 'Apple Music', lastImportAt: new Date() };
    await ctx.db.insert(musicConnections).values(values).onConflictDoUpdate({ target: [musicConnections.userId, musicConnections.provider], set: values });
    return { imported: tracks.length };
  },
  async DELETE(ctx) {
    const user = requireUser(ctx);
    const provider = oneOf(body(ctx).provider, 'Service', ['SPOTIFY', 'APPLE_MUSIC'] as const);
    await ctx.db.delete(musicConnections).where(and(eq(musicConnections.userId, user.id), eq(musicConnections.provider, provider)));
    return { ok: true };
  },
});
