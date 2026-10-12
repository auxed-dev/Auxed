/**
 * Checks every song in the sample catalogue (lib/db/catalog.ts) against the Apple catalogue: the
 * title/artist shown must be the recording its preview, cover and id belong to.
 * Usage: npx tsx scripts/audit-catalog.ts [--fix]   (--fix rewrites lib/db/catalog.ts)
 */
import fs from 'fs';
import path from 'path';
import { T } from '../lib/db/catalog';
import { bestMatch, scoreCandidate } from '../lib/matching';

const country = process.env.MUSIC_COUNTRY ?? 'ZA';
const fix = process.argv.includes('--fix');

interface It {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100?: string;
  trackTimeMillis: number;
  previewUrl?: string;
  wrapperType?: string;
}

async function get(url: string): Promise<It[]> {
  const r = await fetch(url);
  if (!r.ok) return [];
  return ((await r.json()) as { results: It[] }).results.filter((x) => x.trackName && x.trackTimeMillis);
}

const describe = (x: It) => ({ title: x.trackName, artist: x.artistName, durationMs: x.trackTimeMillis });

async function main() {
  const out: Record<string, unknown> = {};
  let bad = 0;
  for (const [key, t] of Object.entries(T)) {
    const wanted = { title: t.title, artist: t.artist, durationMs: t.durationSec * 1000 };
    const id = 'externalId' in t ? t.externalId : undefined;
    const current = id ? (await get(`https://itunes.apple.com/lookup?id=${id}&country=${country}`))[0] : undefined;
    const ok = current ? scoreCandidate({ title: t.title, artist: t.artist }, { title: current.trackName, artist: current.artistName }).ok : false;
    if (ok || !('previewUrl' in t)) {
      out[key] = t;
      continue;
    }
    bad++;
    // The original recording: same title/artist, no live/remix/sped-up version, closest length.
    const results = await get(`https://itunes.apple.com/search?${new URLSearchParams({ term: `${t.artist.split(/,|&/)[0]} ${t.title}`, entity: 'song', limit: '15', country })}`);
    const right = bestMatch({ title: t.title, artist: t.artist }, results, describe) ?? bestMatch(wanted, results, describe);
    console.log(`${key}: shows "${t.title}" — ${t.artist}, but id ${id} is "${current?.trackName}" — ${current?.artistName}${right ? ` -> fixed to ${right.trackId} "${right.trackName}" — ${right.artistName}` : ' -> no original found'}`);
    out[key] = right
      ? {
          ...t,
          album: right.collectionName,
          artwork: right.artworkUrl100?.replace('100x100bb', '600x600bb'),
          durationSec: Math.round(right.trackTimeMillis / 1000),
          previewUrl: right.previewUrl,
          externalId: String(right.trackId),
        }
      : t;
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`${Object.keys(T).length} songs checked, ${bad} pointed at the wrong recording.`);
  if (fix && bad) {
    const file = path.join(__dirname, '..', 'lib', 'db', 'catalog.ts');
    const src = fs.readFileSync(file, 'utf8');
    const head = src.slice(0, src.indexOf('export const T = '));
    const tail = src.slice(src.indexOf('} satisfies Record<string, Track>;') + 1);
    fs.writeFileSync(file, `${head}export const T = ${JSON.stringify(out, null, 2)}${tail}`);
    console.log('lib/db/catalog.ts updated.');
  }
}

main();
