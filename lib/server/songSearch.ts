/**
 * Song search for requests, across every catalogue AUXED can reach:
 *  - iTunes / Apple Music (no key): previews, album art, genre; the local store and the US store,
 *    so songs missing from one still show up.
 *  - Deezer (no key): previews, album art, ISRC and popularity.
 *  - Spotify (SPOTIFY_CLIENT_ID/SECRET): ISRC and popularity.
 *  - YouTube Music (YOUTUBE_API_KEY): only when the others find little (it's quota-expensive);
 *    shown with the original release's album art, never as a video.
 * The same recording from several places becomes one result (Apple's copy preferred, so it plays
 * and previews everywhere). Originals rank above sped-up / remix / live / karaoke versions unless
 * the search asks for one, then by relevance and popularity.
 */
import { bestMatch, creativeVersionMarkers, looseName, normalizeIsrc, normalizeText, romanized, tokenSetRatio, tokenSortRatio } from '../matching';
import type { Track } from '../types';
import { findOnItunes, searchItunes, searchItunesIn, searchSpotify, spotifyEnabledForSearch } from './music';

/** A DJ mix or a full album, not a song. */
const MAX_SONG_SEC = 20 * 60;
const cache = new Map<string, { at: number; tracks: Track[] }>();
const TTL = 10 * 60_000;

interface Hit {
  track: Track;
  /** Where in that source's own ranking it came (0 = first). */
  position: number;
  /** 0..1 popularity where the source gives one. */
  popularity: number | null;
}

/* ------------------------------------------------------------------- sources */

async function deezer(q: string, limit = 25): Promise<Hit[]> {
  const r = await fetch(`https://api.deezer.com/search?${new URLSearchParams({ q, limit: String(limit) })}`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) return [];
  const j = (await r.json()) as {
    data?: { id: number; title: string; duration: number; rank: number; isrc?: string; preview?: string; artist: { name: string }; album: { title: string; cover_xl?: string; cover_big?: string } }[];
  };
  return (j.data ?? []).map((d, position) => ({
    position,
    // Deezer rank: ~1k plays a fringe track, ~1M a hit.
    popularity: Math.min(1, Math.max(0, (Math.log10(Math.max(1, d.rank)) - 3) / 3)),
    track: {
      title: d.title,
      artist: d.artist.name,
      album: d.album.title,
      artwork: d.album.cover_xl ?? d.album.cover_big,
      durationSec: d.duration,
      // Deezer preview links expire after a few hours: fine for a quick listen, never stored.
      previewUrl: d.preview || undefined,
      source: 'deezer' as const,
      externalId: String(d.id),
      isrc: d.isrc ? normalizeIsrc(d.isrc) : undefined,
    },
  }));
}

const isoSeconds = (d: string) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d) ?? [];
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
};

/** "Artist - Song (Official Video)" / an "Artist - Topic" upload -> title and artist. */
export function songFromVideo(title: string, channel: string): { title: string; artist: string } {
  const clean = title
    .replace(/\s*[([](?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|lyric video|visuali[sz]er|hd|hq|4k)[)\]]/gi, '')
    .replace(/\s*\|.*$/, '')
    .trim();
  const by = /^(.+?)\s+by\s+(.+)$/i.exec(clean);
  if (by) return { title: by[1], artist: by[2] };
  const dash = clean.split(/\s+[-–—]\s+/);
  if (dash.length >= 2) return { artist: dash[0], title: dash.slice(1).join(' - ') };
  return { title: clean, artist: channel.replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').trim() };
}

async function youtubeMusic(q: string): Promise<Hit[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const s = await fetch(`https://www.googleapis.com/youtube/v3/search?${new URLSearchParams({ part: 'snippet', type: 'video', videoCategoryId: '10', maxResults: '10', q, key })}`, { signal: AbortSignal.timeout(6000) });
  if (!s.ok) return [];
  const ids = (((await s.json()) as { items?: { id: { videoId: string } }[] }).items ?? []).map((i) => i.id.videoId);
  if (!ids.length) return [];
  const v = await fetch(`https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: 'snippet,contentDetails', id: ids.join(','), key })}`, { signal: AbortSignal.timeout(6000) });
  if (!v.ok) return [];
  const items = ((await v.json()) as { items?: { id: string; snippet: { title: string; channelTitle: string; thumbnails?: Record<string, { url: string }> }; contentDetails: { duration: string } }[] }).items ?? [];
  return items.map((it, position) => {
    const song = songFromVideo(it.snippet.title, it.snippet.channelTitle);
    return {
      position,
      popularity: null,
      track: {
        ...song,
        durationSec: isoSeconds(it.contentDetails.duration),
        // Replaced by the original release's album art when the song is found elsewhere.
        artwork: it.snippet.thumbnails?.high?.url,
        source: 'youtube' as const,
        externalId: it.id,
      },
    };
  });
}

/* ------------------------------------------------------------------- merging & ranking */

const PREFER: Record<Track['source'], number> = { itunes: 0, spotify: 1, deezer: 2, catalog: 3, youtube: 4 };
const primaryArtist = (a: string) => romanized(a.split(/,|&| feat\.| ft\.| x |\band\b/i)[0]);
const songKey = (t: Track) => `${looseName(t.title)}|${primaryArtist(t.artist)}`;

interface Group {
  members: Hit[];
  best: Track;
}

/** The same recording from several sources (same title/artist, length within 4s) -> one result. */
function merge(hits: Hit[]): Group[] {
  const groups: Group[] = [];
  const byKey = new Map<string, Group[]>();
  for (const h of hits) {
    const k = songKey(h.track);
    const isrc = h.track.isrc;
    const g =
      (byKey.get(k) ?? []).find((x) => Math.abs(x.best.durationSec - h.track.durationSec) <= 4) ??
      (isrc ? groups.find((x) => x.members.some((m) => m.track.isrc === isrc)) : undefined);
    if (g) g.members.push(h);
    else {
      const ng = { members: [h], best: h.track };
      groups.push(ng);
      byKey.set(k, [...(byKey.get(k) ?? []), ng]);
    }
  }
  for (const g of groups) {
    const sorted = [...g.members].sort((a, b) => PREFER[a.track.source] - PREFER[b.track.source]);
    const base = sorted[0].track;
    const firstOf = <K extends keyof Track>(k: K) => sorted.map((m) => m.track[k]).find((v) => v !== undefined && v !== '') as Track[K] | undefined;
    g.best = {
      ...base,
      artwork: sorted.filter((m) => m.track.source !== 'youtube').map((m) => m.track.artwork).find(Boolean) ?? base.artwork,
      previewUrl: base.previewUrl ?? firstOf('previewUrl'),
      genre: base.genre ?? firstOf('genre'),
      isrc: base.isrc ?? firstOf('isrc'),
    };
  }
  return groups;
}

/** Version words the person typed ("remix", "live", "sped up") — then those versions are wanted. */
const askedFor = (q: string) => creativeVersionMarkers(q);

function rank(groups: Group[], q: string): Track[] {
  const query = normalizeText(q);
  const wanted = askedFor(q);
  const scored = groups.map((g) => {
    const t = g.best;
    // Titles compared without their "(feat. …)" credits: the hit and a cover both read "Mnike".
    const title = looseName(t.title);
    const text = normalizeText(`${title} ${t.artist}`);
    // Subset match (the words you typed are all there) plus how exact it is (few extra words).
    const subset = Math.max(tokenSetRatio(query, text), tokenSetRatio(query, title) * 0.9);
    const exact = Math.max(tokenSortRatio(query, text), tokenSortRatio(query, title) * 0.9);
    const relevance = 0.65 * subset + 0.35 * exact;
    const markers = creativeVersionMarkers(`${t.title} ${t.album ?? ''}`.replace(/\b(single|ep|deluxe|edition|ultra)\b/gi, ''));
    const unwanted = [...markers].filter((m) => !wanted.has(m)).length;
    const tribute = /\b(tribute|karaoke|cover|made famous|in the style of|sped up|slowed)\b/i.test(t.artist) ? 1 : 0;
    // Knock-offs: 8-bit / music-box / lullaby renditions, "type beats", and very short edits.
    const knockoff = /\b(8-?bit|emu[a-z]*tion|type beat|music box|lullab(y|ies)|originally performed|made famous|in the style of|ringtone)\b/i.test(`${t.title} ${t.artist} ${t.album ?? ''}`) ? 1 : 0;
    const tooShort = t.durationSec < 100 && !/\bshort\b/i.test(q) ? 1 : 0;
    // Catalogues list results roughly by popularity; iTunes gives no number, so its order stands in.
    const popularity = Math.max(0, ...g.members.map((m) => m.popularity ?? Math.max(0, 0.5 - m.position * 0.03)));
    const position = Math.min(...g.members.map((m) => m.position));
    const score = relevance * 1.3 - (unwanted ? 0.55 : 0) - tribute * 0.7 - knockoff * 0.8 - tooShort * 0.35 + popularity * 0.6 + Math.min(3, g.members.length) * 0.05 - position * 0.004;
    return { t, score };
  });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.t);
}

/* ------------------------------------------------------------------- previews */

/** A 30-second preview of this exact recording: Apple's first, then Deezer's (a fresh link). */
export async function findPreview(t: Pick<Track, 'title' | 'artist' | 'durationSec'>): Promise<string | null> {
  const apple = await findOnItunes(t).catch(() => null);
  if (apple?.previewUrl) return apple.previewUrl;
  if (process.env.DEEZER_SEARCH === 'off') return null;
  const hits = await deezer(`artist:"${t.artist.split(/,|&| feat\.| ft\./i)[0].trim()}" track:"${looseName(t.title)}"`, 10).catch(() => [] as Hit[]);
  const best = bestMatch({ title: t.title, artist: t.artist, durationMs: t.durationSec * 1000 }, hits, (h) => ({ title: h.track.title, artist: h.track.artist, durationMs: h.track.durationSec * 1000 }));
  return best?.track.previewUrl ?? null;
}

/* ------------------------------------------------------------------- search */

export async function searchAllCatalogues(query: string, limit = 30): Promise<Track[]> {
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  const key = `${q.toLowerCase()}|${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.tracks;

  const local = (process.env.MUSIC_COUNTRY ?? 'ZA').toUpperCase();
  const asHits = (tracks: Track[]): Hit[] => tracks.map((track, position) => ({ track, position, popularity: null }));
  const settled = await Promise.allSettled([
    searchItunes(q, 25).then((t) => asHits(t)),
    local === 'US' ? Promise.resolve([] as Hit[]) : searchItunesIn(q, 15, 'US').then((t) => asHits(t)),
    process.env.DEEZER_SEARCH === 'off' ? Promise.resolve([] as Hit[]) : deezer(q),
    spotifyEnabledForSearch() ? searchSpotify(q, 20).then((t) => t.map((track, position) => ({ track, position, popularity: track.popularity ?? null }))) : Promise.resolve([] as Hit[]),
  ]);
  let hits = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  hits = hits.filter((h) => h.track.durationSec > 0 && h.track.durationSec <= MAX_SONG_SEC);
  let groups = merge(hits);
  // Few results: try YouTube Music too, and give its finds the original release's album art.
  if (groups.length < 6) {
    const yt = await youtubeMusic(q).catch(() => [] as Hit[]);
    for (const h of yt) {
      const original = await findOnItunes(h.track).catch(() => null);
      if (original) {
        h.track = { ...h.track, artwork: original.artwork, album: original.album, genre: original.genre, previewUrl: original.previewUrl };
      }
    }
    groups = merge([...hits, ...yt.filter((h) => h.track.durationSec <= MAX_SONG_SEC)]);
  }
  const tracks = rank(groups, q).slice(0, limit);
  cache.set(key, { at: Date.now(), tracks });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return tracks;
}
