/**
 * Request by link: paste a song from Spotify, Apple Music, YouTube / YouTube Music, SoundCloud or
 * Deezer and AUXED finds that song (the same recording in its catalogue, so pricing, previews and
 * auto-queue all work). Link shapes follow SongMirror's services/playlist_links.py (MIT, Copyright
 * (c) 2026 Ahnaf An Nafee). Each service is only reached through its own public lookup endpoint
 * (catalogue lookup or oEmbed) — the pasted URL itself is never fetched.
 */
import { bestMatch, looseName, normalizeIsrc } from '../matching';
import type { Track } from '../types';
import { findOnItunes, itunesSong, searchItunes, spotifyTrack } from './music';

type Provider = 'spotify' | 'apple' | 'youtube' | 'soundcloud' | 'deezer';

const HOSTS: [string, Provider][] = [
  ['open.spotify.com', 'spotify'],
  ['play.spotify.com', 'spotify'],
  ['music.apple.com', 'apple'],
  ['itunes.apple.com', 'apple'],
  ['music.youtube.com', 'youtube'],
  ['youtube.com', 'youtube'],
  ['m.youtube.com', 'youtube'],
  ['youtu.be', 'youtube'],
  ['soundcloud.com', 'soundcloud'],
  ['on.soundcloud.com', 'soundcloud'],
  ['deezer.com', 'deezer'],
];

export const looksLikeSongLink = (q: string) => /^(https?:\/\/|spotify:track:)/i.test(q.trim());

/** Which service a link is from, and the song id when the link carries one. */
export function parseSongLink(input: string): { provider: Provider; id: string | null; url: string } | null {
  const raw = input.trim();
  const uri = /^spotify:track:([A-Za-z0-9]+)$/i.exec(raw);
  if (uri) return { provider: 'spotify', id: uri[1], url: `https://open.spotify.com/track/${uri[1]}` };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const provider = HOSTS.find(([h]) => host === h || host.endsWith(`.${h}`))?.[1];
  if (!provider) return null;
  const path = u.pathname;
  const id = (() => {
    switch (provider) {
      case 'spotify':
        return /\/track\/([A-Za-z0-9]+)/.exec(path)?.[1] ?? null;
      case 'apple':
        // /album/name/123?i=456 (song 456) or /song/name/456
        return u.searchParams.get('i') ?? /\/song\/(?:[^/]+\/)?(\d+)/.exec(path)?.[1] ?? null;
      case 'youtube':
        return u.searchParams.get('v') ?? (host === 'youtu.be' ? path.slice(1).split('/')[0] : /\/(?:shorts|embed|live)\/([\w-]{6,})/.exec(path)?.[1] ?? null);
      case 'deezer':
        return /\/track\/(\d+)/.exec(path)?.[1] ?? null;
      default:
        return null;
    }
  })();
  return { provider, id, url: u.toString() };
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** "Artist - Song (Official Video)" / "Song by Artist" -> { title, artist }. */
function splitTitle(text: string, credit: string): { title: string; artist: string } {
  const clean = text
    .replace(/\s*[([](?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|lyric video|visuali[sz]er|hd|hq|4k)[)\]]/gi, '')
    .replace(/\s*\|.*$/, '')
    .trim();
  const by = /^(.+?)\s+by\s+(.+)$/i.exec(clean);
  if (by) return { title: by[1], artist: by[2] };
  const dash = clean.split(/\s+[-–—]\s+/);
  if (dash.length >= 2) return { artist: dash[0], title: dash.slice(1).join(' - ') };
  return { title: clean, artist: credit.replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').trim() };
}

/** Best catalogue match for a title/artist (length when known); otherwise the closest search results. */
async function toCatalogue(title: string, artist: string, durationSec?: number, isrc?: string): Promise<Track[]> {
  if (durationSec) {
    const exact = await findOnItunes({ title, artist, durationSec });
    if (exact) return [{ ...exact, isrc: isrc ?? exact.isrc }];
  }
  const results = await searchItunes(`${artist} ${looseName(title)}`, 10).catch(() => [] as Track[]);
  const best = bestMatch({ title, artist }, results, (r) => ({ title: r.title, artist: r.artist }));
  return best ? [best, ...results.filter((r) => r !== best).slice(0, 4)] : results.slice(0, 5);
}

/** Catalogues often list the same recording twice (single and album); show it once. */
const unique = (tracks: Track[]) => {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    const k = `${looseName(t.title)}|${t.artist.toLowerCase()}|${Math.round(t.durationSec / 3)}`;
    return !seen.has(k) && !!seen.add(k);
  });
};

/** The song(s) a pasted link points to — the exact one first when it can be pinned down. */
export async function resolveSongLink(input: string): Promise<Track[]> {
  return unique(await resolve(input));
}

async function resolve(input: string): Promise<Track[]> {
  const link = parseSongLink(input);
  if (!link) return [];
  const enc = encodeURIComponent(link.url);
  switch (link.provider) {
    case 'apple': {
      const t = link.id ? await itunesSong(link.id) : null;
      return t ? [t] : [];
    }
    case 'spotify': {
      if (!link.id) return [];
      const t = await spotifyTrack(link.id);
      if (t) {
        // Prefer the catalogue copy (genre + preview), keeping Spotify's ISRC for exact auto-queue.
        const same = await findOnItunes(t);
        return [same ? { ...same, isrc: t.isrc } : t];
      }
      // No Spotify API keys: its oEmbed gives the song name only.
      const o = await getJson<{ title?: string }>(`https://open.spotify.com/oembed?url=${enc}`);
      return o?.title ? (await searchItunes(o.title, 8).catch(() => [])).slice(0, 5) : [];
    }
    case 'deezer': {
      if (!link.id) return [];
      const d = await getJson<{ title?: string; duration?: number; isrc?: string; artist?: { name: string } }>(`https://api.deezer.com/track/${link.id}`);
      if (!d?.title || !d.artist) return [];
      return toCatalogue(d.title, d.artist.name, d.duration, d.isrc ? normalizeIsrc(d.isrc) : undefined);
    }
    case 'youtube': {
      if (!link.id) return [];
      const o = await getJson<{ title?: string; author_name?: string }>(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${link.id}`)}`);
      if (!o?.title) return [];
      const s = splitTitle(o.title, o.author_name ?? '');
      return toCatalogue(s.title, s.artist);
    }
    case 'soundcloud': {
      const o = await getJson<{ title?: string; author_name?: string }>(`https://soundcloud.com/oembed?format=json&url=${enc}`);
      if (!o?.title) return [];
      const s = splitTitle(o.title, o.author_name ?? '');
      return toCatalogue(s.title, s.artist);
    }
  }
}
