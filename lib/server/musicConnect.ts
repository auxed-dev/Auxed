/**
 * Linking people's music services.
 *  - Spotify: OAuth (authorization code + PKCE). Used to import favourites and, for hosts/venues,
 *    to auto-queue approved requests on their active Spotify device. Needs SPOTIFY_CLIENT_ID/SECRET.
 *    Note Spotify's rules: queue control needs Premium, apps start in development mode (25 users),
 *    and Spotify's developer policy does not allow business/public-venue use.
 *  - Apple Music: MusicKit on the web. The server only mints the developer token
 *    (APPLE_MUSIC_TEAM_ID / APPLE_MUSIC_KEY_ID / APPLE_MUSIC_PRIVATE_KEY); the person signs in on their
 *    own device and the browser imports their favourites.
 *    With the `streaming` scope the AUXED Player itself becomes a Spotify Connect speaker
 *    (Spotify's Web Playback SDK, Premium, desktop browsers).
 *  - YouTube: search only (YOUTUBE_API_KEY), used by the AUXED Player.
 */
import { createHash, createPrivateKey, sign } from 'crypto';
import { and, eq } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { DB } from '../db';
import { favorites, musicConnections, trackLinks } from '../db/schema';
import type { Track } from '../types';
import { bestMatch, normalizeIsrc, scoreVideo } from '../matching';
import { decryptSecret, encryptSecret, newId, token } from './crypto';
import { HttpError, appUrl } from './http';
import { appendCookie } from './session';

const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-top-read',
  'user-read-recently-played',
  'user-library-read',
  // Web Playback SDK: lets the AUXED Player play on this account.
  'streaming',
  'user-read-email',
  'user-read-private',
].join(' ');
const STATE_COOKIE = 'auxed_music';

export const spotifyEnabled = () => !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
export const appleMusicEnabled = () => !!(process.env.APPLE_MUSIC_TEAM_ID && process.env.APPLE_MUSIC_KEY_ID && process.env.APPLE_MUSIC_PRIVATE_KEY);
export const youtubeEnabled = () => !!process.env.YOUTUBE_API_KEY;

const spotifyRedirect = (req: NextApiRequest) => `${appUrl(req)}/api/music/connect/spotify/callback`;

export function startSpotifyConnect(req: NextApiRequest, res: NextApiResponse, returnTo: string): string {
  const state = token(24);
  const verifier = token(48);
  const payload = Buffer.from(JSON.stringify({ state, verifier, returnTo })).toString('base64url');
  const secure = process.env.NODE_ENV === 'production';
  appendCookie(res, `${STATE_COOKIE}=${payload}; Path=/api/music/connect; HttpOnly; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`);
  return `https://accounts.spotify.com/authorize?${new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: spotifyRedirect(req),
    scope: SPOTIFY_SCOPES,
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  })}`;
}

const basicAuth = () => `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`;

export async function finishSpotifyConnect(db: DB, req: NextApiRequest, res: NextApiResponse, userId: string): Promise<string> {
  const raw = req.cookies[STATE_COOKIE];
  appendCookie(res, `${STATE_COOKIE}=; Path=/api/music/connect; Max-Age=0`);
  if (!raw) throw new HttpError(400, 'Connection expired. Try again.');
  const saved = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { state: string; verifier: string; returnTo: string };
  if (req.query.error) return `${saved.returnTo}?music=cancelled`;
  if (req.query.state !== saved.state || typeof req.query.code !== 'string') throw new HttpError(400, 'Connection could not be verified. Try again.');
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: req.query.code, redirect_uri: spotifyRedirect(req), code_verifier: saved.verifier }),
  });
  if (!tokenRes.ok) throw new HttpError(502, 'Spotify did not accept the connection. Try again.');
  const t = (await tokenRes.json()) as { access_token: string; refresh_token: string; expires_in: number; scope: string };
  const me = (await (await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${t.access_token}` } })).json()) as { id?: string; display_name?: string };
  const values = {
    userId,
    provider: 'SPOTIFY' as const,
    externalId: me.id ?? null,
    displayName: me.display_name ?? me.id ?? 'Spotify',
    accessTokenEnc: encryptSecret(t.access_token),
    refreshTokenEnc: encryptSecret(t.refresh_token),
    expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000),
    scope: t.scope,
  };
  await db.insert(musicConnections).values(values).onConflictDoUpdate({ target: [musicConnections.userId, musicConnections.provider], set: values });
  try {
    await importSpotifyFavorites(db, userId);
  } catch (err) {
    console.error('[spotify] import failed', err);
  }
  return `${saved.returnTo}?music=spotify`;
}

/** A fresh Spotify access token for this user (refreshing if needed), or null if not connected. */
export async function spotifyAccess(db: DB, userId: string): Promise<string | null> {
  const c = (await db.select().from(musicConnections).where(and(eq(musicConnections.userId, userId), eq(musicConnections.provider, 'SPOTIFY'))).limit(1))[0];
  if (!c) return null;
  if (c.expiresAt && c.expiresAt.getTime() > Date.now()) return decryptSecret(c.accessTokenEnc);
  const refresh = decryptSecret(c.refreshTokenEnc);
  if (!refresh || !spotifyEnabled()) return null;
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
  });
  if (!r.ok) return null;
  const t = (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  await db
    .update(musicConnections)
    .set({
      accessTokenEnc: encryptSecret(t.access_token),
      refreshTokenEnc: t.refresh_token ? encryptSecret(t.refresh_token) : c.refreshTokenEnc,
      expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000),
    })
    .where(and(eq(musicConnections.userId, userId), eq(musicConnections.provider, 'SPOTIFY')));
  return t.access_token;
}

/** An access token for the AUXED Player's Spotify speaker (the person's own account, `streaming` scope). */
export async function spotifyPlayerToken(db: DB, userId: string) {
  const c = (await db.select({ scope: musicConnections.scope }).from(musicConnections).where(and(eq(musicConnections.userId, userId), eq(musicConnections.provider, 'SPOTIFY'))).limit(1))[0];
  if (!c) throw new HttpError(409, 'Connect your Spotify account on this login first.', 'CONNECT_SPOTIFY');
  if (!c.scope?.split(' ').includes('streaming')) throw new HttpError(409, 'Reconnect Spotify so the AUXED Player can play on your account.', 'RECONNECT_SPOTIFY');
  const accessToken = await spotifyAccess(db, userId);
  if (!accessToken) throw new HttpError(409, 'The Spotify connection has expired — reconnect it.', 'RECONNECT_SPOTIFY');
  const row = (await db.select({ expiresAt: musicConnections.expiresAt }).from(musicConnections).where(and(eq(musicConnections.userId, userId), eq(musicConnections.provider, 'SPOTIFY'))).limit(1))[0];
  return { accessToken, expiresAt: (row?.expiresAt ?? new Date(Date.now() + 30 * 60_000)).toISOString() };
}

interface SpotifyTrack {
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string; width: number }[] };
  external_ids?: { isrc?: string };
  id: string;
}

export function fromSpotify(t: SpotifyTrack): Track {
  const img = [...(t.album.images ?? [])].sort((a, b) => b.width - a.width)[0]?.url;
  return {
    title: t.name,
    artist: t.artists.map((a) => a.name).join(', '),
    album: t.album.name,
    artwork: img,
    durationSec: Math.round(t.duration_ms / 1000),
    source: 'spotify',
    externalId: t.id,
    isrc: t.external_ids?.isrc ? normalizeIsrc(t.external_ids.isrc) : undefined,
  };
}

async function spotifyGet<T>(accessToken: string, path: string): Promise<T> {
  const r = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new HttpError(502, `Spotify request failed (${r.status}).`);
  return (await r.json()) as T;
}

/** Top tracks + liked songs -> Treasure Box favourites (source SPOTIFY). */
export async function importSpotifyFavorites(db: DB, userId: string) {
  const at = await spotifyAccess(db, userId);
  if (!at) throw new HttpError(400, 'Connect Spotify first.');
  const [top, saved] = await Promise.all([
    spotifyGet<{ items: SpotifyTrack[] }>(at, '/me/top/tracks?limit=30&time_range=short_term'),
    spotifyGet<{ items: { track: SpotifyTrack }[] }>(at, '/me/tracks?limit=30'),
  ]);
  const tracks = [...top.items, ...saved.items.map((s) => s.track)].filter(Boolean).map(fromSpotify);
  await replaceImported(db, userId, 'SPOTIFY', tracks);
  await db.update(musicConnections).set({ lastImportAt: new Date() }).where(and(eq(musicConnections.userId, userId), eq(musicConnections.provider, 'SPOTIFY')));
  return tracks.length;
}

/** Replace a person's imported favourites from one service (deduplicated, newest first). */
export async function replaceImported(db: DB, userId: string, source: 'SPOTIFY' | 'APPLE_MUSIC', tracks: Track[]) {
  const seen = new Set<string>();
  const unique = tracks.filter((t) => {
    const k = `${t.title}|${t.artist}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  await db.transaction(async (tx) => {
    await tx.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.source, source)));
    if (unique.length) await tx.insert(favorites).values(unique.slice(0, 60).map((track, i) => ({ id: newId(), userId, kind: 'TRACK' as const, track, source, createdAt: new Date(Date.now() - i * 1000) })));
  });
}

const linkKey = (t: Pick<Track, 'title' | 'artist'>) => `${t.title}|${t.artist}`.toLowerCase().slice(0, 300);

/**
 * Find a track's Spotify URI (cached): the ISRC when we have it, otherwise the best search result
 * that is safely the same recording (never a live/remix/cover stand-in).
 */
export async function spotifyUriFor(db: DB, accessToken: string, t: Track): Promise<string | null> {
  if (t.source === 'spotify' && t.externalId) return `spotify:track:${t.externalId}`;
  const key = linkKey(t);
  const hit = (await db.select().from(trackLinks).where(eq(trackLinks.key, key)).limit(1))[0];
  if (hit?.spotifyUri) return hit.spotifyUri;
  const wanted = { title: t.title, artist: t.artist, durationMs: t.durationSec * 1000 };
  const describe = (s: SpotifyTrack) => ({ title: s.name, artist: s.artists.map((a) => a.name), durationMs: s.duration_ms });
  const search = async (q: string) => (await spotifyGet<{ tracks: { items: SpotifyTrack[] } }>(accessToken, `/search?type=track&limit=8&q=${encodeURIComponent(q)}`)).tracks.items;
  let found: SpotifyTrack | null = null;
  if (t.isrc) found = (await search(`isrc:${t.isrc}`))[0] ?? null;
  const firstArtist = t.artist.split(/,|&| feat\.| ft\.| x /i)[0].trim();
  const title = t.title.replace(/\(.*?\)|\[.*?\]/g, '').trim();
  if (!found) found = bestMatch(wanted, await search(`track:${title} artist:${firstArtist}`), describe);
  if (!found) found = bestMatch(wanted, await search(`${title} ${firstArtist}`), describe);
  const uri = found?.uri ?? null;
  if (uri) await db.insert(trackLinks).values({ key, spotifyUri: uri }).onConflictDoUpdate({ target: trackLinks.key, set: { spotifyUri: uri, updatedAt: new Date() } });
  return uri;
}

/** Queue a URI on the person's active Spotify device. */
export async function spotifyQueue(accessToken: string, uri: string) {
  const r = await fetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
  if (r.status === 404) throw new HttpError(409, 'No active Spotify device. Start playing something in Spotify on the speaker device first.', 'NO_DEVICE');
  if (r.status === 403) throw new HttpError(409, 'Spotify Premium is needed to queue songs.', 'PREMIUM');
  if (!r.ok && r.status !== 204) throw new HttpError(502, `Spotify could not queue the song (${r.status}).`);
}

export interface SpotifyNow {
  track: Track;
  uri: string;
  progressMs: number;
  isPlaying: boolean;
}

export async function spotifyNowPlaying(accessToken: string): Promise<SpotifyNow | null> {
  const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (r.status === 204 || !r.ok) return null;
  const j = (await r.json()) as { item?: SpotifyTrack; progress_ms?: number; is_playing?: boolean };
  if (!j.item) return null;
  return { track: fromSpotify(j.item), uri: j.item.uri, progressMs: j.progress_ms ?? 0, isPlaying: !!j.is_playing };
}

/* ----------------------------------------------------------------------- Apple Music */

let appleToken: { value: string; at: number } | null = null;

/** MusicKit developer token (ES256 JWT, valid 30 days; cached 12 hours). */
export function appleMusicDeveloperToken(): string {
  if (!appleMusicEnabled()) throw new HttpError(503, 'Apple Music is not set up yet.', 'NOT_CONFIGURED');
  if (appleToken && Date.now() - appleToken.at < 12 * 3600_000) return appleToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: process.env.APPLE_MUSIC_KEY_ID })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: process.env.APPLE_MUSIC_TEAM_ID, iat: now, exp: now + 30 * 86400 })).toString('base64url');
  const key = createPrivateKey(process.env.APPLE_MUSIC_PRIVATE_KEY!.replace(/\\n/g, '\n'));
  const sig = sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  appleToken = { value: `${header}.${payload}.${sig}`, at: Date.now() };
  return appleToken.value;
}

/* ----------------------------------------------------------------------------- YouTube */

const isoSeconds = (d: string) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d) ?? [];
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
};

/**
 * Best embeddable YouTube video for a track (cached): the official upload or the artist's
 * "Topic" audio whose length matches — not a live, sped-up, karaoke or cover video.
 */
export async function youtubeIdFor(db: DB, t: Track): Promise<string | null> {
  const key = linkKey(t);
  const hit = (await db.select().from(trackLinks).where(eq(trackLinks.key, key)).limit(1))[0];
  if (hit?.youtubeId) return hit.youtubeId;
  if (!youtubeEnabled()) return null;
  const apiKey = process.env.YOUTUBE_API_KEY!;
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${new URLSearchParams({ part: 'snippet', type: 'video', videoEmbeddable: 'true', videoCategoryId: '10', maxResults: '8', q: `${t.artist} ${t.title}`, key: apiKey })}`,
  );
  if (!r.ok) return null;
  const j = (await r.json()) as { items?: { id: { videoId: string } }[] };
  const ids = (j.items ?? []).map((i) => i.id.videoId).filter(Boolean);
  if (!ids.length) return null;
  // Lengths and titles in one cheap call, so the match can use duration too.
  const v = await fetch(`https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: 'snippet,contentDetails', id: ids.join(','), key: apiKey })}`);
  if (!v.ok) return null;
  const vj = (await v.json()) as { items?: { id: string; snippet: { title: string; channelTitle: string }; contentDetails: { duration: string } }[] };
  const wanted = { title: t.title, artist: t.artist, durationMs: t.durationSec * 1000 };
  let id: string | null = null;
  let top = 0;
  for (const it of vj.items ?? []) {
    const s = scoreVideo(wanted, { title: it.snippet.title, channel: it.snippet.channelTitle, durationMs: isoSeconds(it.contentDetails.duration) * 1000 });
    if (s.ok && s.score > top) {
      top = s.score;
      id = it.id;
    }
  }
  if (id) await db.insert(trackLinks).values({ key, youtubeId: id }).onConflictDoUpdate({ target: trackLinks.key, set: { youtubeId: id, updatedAt: new Date() } });
  return id;
}
