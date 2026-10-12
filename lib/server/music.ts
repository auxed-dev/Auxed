import type { Track } from '../types';

/**
 * Song search for requests. Uses Spotify (client-credentials) when SPOTIFY_CLIENT_ID/SECRET are set,
 * otherwise the public iTunes Search API. Results are cached for 10 minutes per query.
 */

const cache = new Map<string, { at: number; tracks: Track[] }>();
const TTL = 10 * 60_000;

const GENRES: Record<string, string> = {
  'Hip-Hop/Rap': 'Hip-Hop',
  Dance: 'House',
  Electronic: 'House',
  African: 'Afrobeats',
  Worldwide: 'Afrobeats',
  'R&B/Soul': 'R&B',
};

export async function searchTracks(query: string, limit = 20): Promise<Track[]> {
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  const key = `${q.toLowerCase()}|${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.tracks;
  const tracks = process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET ? await spotify(q, limit) : await itunes(q, limit);
  cache.set(key, { at: Date.now(), tracks });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return tracks;
}

async function itunes(q: string, limit: number): Promise<Track[]> {
  const country = process.env.MUSIC_COUNTRY ?? 'ZA';
  const url = `https://itunes.apple.com/search?${new URLSearchParams({ term: q, entity: 'song', limit: String(limit), country })}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`iTunes search failed (${res.status})`);
  const data = (await res.json()) as { results: any[] };
  return data.results
    .filter((r) => r.trackName && r.trackTimeMillis)
    .map((r) => ({
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName,
      artwork: typeof r.artworkUrl100 === 'string' ? r.artworkUrl100.replace('100x100bb', '600x600bb') : undefined,
      durationSec: Math.round(r.trackTimeMillis / 1000),
      genre: GENRES[r.primaryGenreName] ?? r.primaryGenreName,
      previewUrl: r.previewUrl,
      source: 'itunes' as const,
      externalId: String(r.trackId),
    }));
}

let spotifyToken: { value: string; exp: number } | null = null;

async function spotifyAuth(): Promise<string> {
  if (spotifyToken && spotifyToken.exp > Date.now() + 30_000) return spotifyToken.value;
  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Spotify auth failed (${res.status})`);
  const data = await res.json();
  spotifyToken = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return spotifyToken.value;
}

async function spotify(q: string, limit: number): Promise<Track[]> {
  const tokenValue = await spotifyAuth();
  const market = process.env.MUSIC_COUNTRY ?? 'ZA';
  const res = await fetch(`https://api.spotify.com/v1/search?${new URLSearchParams({ q, type: 'track', limit: String(Math.min(limit, 50)), market })}`, {
    headers: { Authorization: `Bearer ${tokenValue}` },
  });
  if (!res.ok) throw new Error(`Spotify search failed (${res.status})`);
  const data = await res.json();
  return (data.tracks?.items ?? []).map((t: any) => ({
    title: t.name,
    artist: (t.artists ?? []).map((a: any) => a.name).join(', '),
    album: t.album?.name,
    artwork: t.album?.images?.[0]?.url,
    durationSec: Math.round(t.duration_ms / 1000),
    previewUrl: t.preview_url ?? undefined,
    source: 'spotify' as const,
    externalId: t.id,
  }));
}

/** Validates a track object coming from the client (it originally came from searchTracks). */
export function sanitizeTrack(raw: unknown): Track | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
  const title = s(t.title, 200);
  const artist = s(t.artist, 200);
  const durationSec = Number(t.durationSec);
  if (!title || !artist || !Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 60 * 60) return null;
  const https = (v: unknown) => {
    const u = s(v, 1000);
    return u && u.startsWith('https://') ? u : undefined;
  };
  const source = t.source === 'spotify' || t.source === 'catalog' ? t.source : 'itunes';
  return {
    title,
    artist,
    album: s(t.album, 200),
    artwork: https(t.artwork),
    durationSec: Math.round(durationSec),
    genre: s(t.genre, 60),
    previewUrl: https(t.previewUrl),
    source,
    externalId: s(t.externalId, 100),
  };
}
