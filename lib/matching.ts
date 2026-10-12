/**
 * Track matching across music services: is this search result the same recording as the song
 * someone asked for? A hard identifier (ISRC) wins when there is one; otherwise candidates are
 * scored on title, artist and duration, and anything that is clearly a different recording
 * (live, remix, acoustic, cover, karaoke, sped up...) or a different performer is rejected, so a
 * request never quietly turns into the wrong version.
 *
 * Ported to TypeScript from SongMirror's engine/matching.py
 * (https://github.com/ahnafnafee/songmirror), MIT License, Copyright (c) 2026 Ahnaf An Nafee.
 * Fuzzy helpers re-implement the RapidFuzz measures it uses (ratio, token sort/set, Jaro-Winkler).
 */

export const FUZZY_THRESHOLD = 0.92;
const DURATION_TOLERANCE_MS = 2500;
const CATALOG_DURATION_TOLERANCE_MS = 5000;

const PAREN_FEAT_RE = /[([]\s*(feat|featuring|ft|with)\b.*?[)\]]/gi;
const TRAILING_FEAT_RE = /\s+(?:feat|featuring|ft)\.?\s+.*?(?=\s*[([{]|\s+[-–—]\s+|$)/gi;
const BONUS_TRACK_SUFFIX_RE = /(?:\s+[-–—/]\s*bonus\s+track|\s*[([]\s*bonus\s+track\s*[)\]])\s*$/i;

/** Title qualifiers that mean a different recording. */
const CREATIVE_VERSION_PATTERNS: [string, RegExp][] = [
  ['live', /\b(?:live|canli|ao vivo|en vivo|recorded (?:in|at|live))\b/i],
  ['acoustic', /\b(?:acoustic|akustik|acustic[oa]|acoustique|unplugged|stripped)\b/i],
  ['remix', /\b(?:remix|rework|mashup)\b/i],
  ['dub', /\b(?:dub|dubbed)\b/i],
  ['mix', /\bmix\b/i],
  ['edit', /\bedit\b/i],
  ['vip', /\bvip\b/i],
  ['instrumental', /\binstrumental\b/i],
  ['karaoke', /\bkaraoke\b/i],
  ['piano', /\bpiano\b/i],
  ['demo', /\bdemo\b/i],
  ['session', /\bsession\b/i],
  ['alternate-speed', /\b(?:sped up|slowed(?: down)?|nightcore)\b/i],
  ['mix-format', /\b(?:mono|stereo)\b/i],
  ['cover', /\b(?:cover|rendition)\b/i],
  ['a-cappella', /\ba ?ca?pp?ella\b/i],
  ['orchestral', /\b(?:orchestral|orchestra|symphonic)\b/i],
  ['re-recording', /\bre ?record(?:ed|ing)\b/i],
  ['reverb', /\breverb\b/i],
  ['spatial', /\b(?:8d|binaural)\b/i],
  ['solo', /\bsolo\b/i],
  ['alternate', /\b(?:alternate|alternative)\b/i],
];

/* ------------------------------------------------------------------ normalising */

/** Lower-case, letters and digits in any script, single spaces. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  let s = String(value).normalize('NFKC').toLowerCase();
  s = s.replace(/i̇/g, 'i').normalize('NFKC');
  s = s.replace(/[^\p{L}\p{N}]+/gu, ' ');
  return s.split(/\s+/).filter(Boolean).join(' ');
}

/** Accent-free spelling for cross-spelling matches (Beyoncé -> beyonce). */
export function romanized(text: string | null | undefined): string {
  return normalizeText(
    String(text ?? '')
      .normalize('NFKD')
      .replace(/\p{M}+/gu, ''),
  );
}

export function normalizeIsrc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toUpperCase();
}

const withoutFeatureCredits = (name: string) => String(name ?? '').replace(PAREN_FEAT_RE, ' ').replace(TRAILING_FEAT_RE, '');

/** Title without "(feat. X)" — the classic difference for the same song. Version words stay. */
export function looseName(name: string | null | undefined): string {
  const raw = String(name ?? '').trim();
  const cleaned = normalizeText(withoutFeatureCredits(raw)).replace(/\bver\b/g, 'version');
  return cleaned || normalizeText(raw) || raw.toLowerCase();
}

export function creativeVersionMarkers(name: string | null | undefined): Set<string> {
  const normalized = romanized(looseName(name));
  const markers = new Set(CREATIVE_VERSION_PATTERNS.filter(([, re]) => re.test(normalized)).map(([m]) => m));
  if (!markers.size && /\bversion\b/.test(normalized)) markers.add('alternate-version');
  return markers;
}

/** Guest artists credited in a title ("Song (feat. A & B)"). */
export function featuredArtists(name: string | null | undefined): string[] {
  const credits: string[] = [];
  for (const re of [PAREN_FEAT_RE, TRAILING_FEAT_RE]) {
    for (const m of String(name ?? '').matchAll(new RegExp(re.source, re.flags))) {
      const credit = m[0].replace(/^[\s([]*(?:feat|featuring|ft|with)\b\.?\s*/i, '').replace(/[)\]\s]+$/, '');
      credits.push(...credit.split(/\s*(?:,|&|\band\b)\s*/i).map((p) => p.trim()).filter(Boolean));
    }
  }
  return credits;
}

const hasCredit = (credit: string, artists: string) => ` ${romanized(artists)} `.includes(` ${romanized(credit)} `);

/** Recording family plus named mix/venue qualifiers ("Skrillex Remix" vs "Diplo Remix"). */
function versionSignature(name: string | null | undefined): string {
  const n = String(name ?? '').replace(BONUS_TRACK_SUFFIX_RE, '');
  const markers = [...creativeVersionMarkers(n)].sort();
  const details: string[] = [];
  for (const part of withoutFeatureCredits(n).split(/\s+[-–—]\s+|[()[\]{}]/).slice(1)) {
    if (!creativeVersionMarkers(part).size) continue;
    let normalized = romanized(looseName(part));
    for (const [marker, re] of CREATIVE_VERSION_PATTERNS) normalized = normalized.replace(new RegExp(re.source, 'gi'), marker);
    if (markers.join() !== 'alternate-version') normalized = normalized.replace(/\bversion\b/g, '');
    const detail = normalized.split(/\s+/).filter(Boolean).sort().join(' ');
    if (detail !== markers.join(' ')) details.push(detail);
  }
  return `${markers.join(',')}|${details.sort().join(',')}`;
}

/**
 * Same kind of recording, and every guest artist the wanted song names is credited on the
 * candidate. (Unlike SongMirror, a candidate may credit extra guests: catalogues often show
 * "Song (feat. X)" where a request or a set list just says "Song" — it's the same recording, and
 * a different length still rules out a different version.)
 */
export function recordingVersionsCompatible(name: string, artists: string | string[], candName: string, candArtists: string | string[]) {
  if (versionSignature(name) !== versionSignature(candName)) return false;
  const features = featuredArtists(name);
  const candCredits = [...(Array.isArray(candArtists) ? candArtists : [candArtists]), ...featuredArtists(candName)].join(' ');
  return features.every((g) => hasCredit(g, candCredits));
}

/** "title|artist" key that survives feat-credit and punctuation differences. */
export function trackKey(name: string, artist: string): string {
  let credits = String(artist ?? '');
  for (const guest of featuredArtists(name)) if (!hasCredit(guest, credits)) credits += ` ${guest}`;
  return `${looseName(name)}|${normalizeText(credits)}`;
}

/* ------------------------------------------------------------------ fuzzy measures */

function lcs(a: string, b: string): number {
  if (!a || !b) return 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

/** RapidFuzz `ratio` (normalised Indel similarity), 0..1. */
export function ratio(a: string, b: string): number {
  if (!a && !b) return 1;
  return (2 * lcs(a, b)) / (a.length + b.length);
}

const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

export function tokenSortRatio(a: string, b: string): number {
  return ratio(tokens(a).sort().join(' '), tokens(b).sort().join(' '));
}

/** Order-, subset- and decoration-tolerant similarity, 0..1. */
export function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  const inter = [...ta].filter((t) => tb.has(t)).sort();
  const onlyA = [...ta].filter((t) => !tb.has(t)).sort();
  const onlyB = [...tb].filter((t) => !ta.has(t)).sort();
  if (inter.length && (!onlyA.length || !onlyB.length)) return 1;
  const sect = inter.join(' ');
  const ab = [sect, ...onlyA].filter(Boolean).join(' ');
  const ba = [sect, ...onlyB].filter(Boolean).join(' ');
  return Math.max(sect ? ratio(sect, ab) : 0, sect ? ratio(sect, ba) : 0, ratio(ab, ba));
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array<boolean>(a.length).fill(false);
  const bm = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Penalises extra words, with a Jaro-Winkler floor for short strings. */
const simStrict = (a: string, b: string) => (!a || !b ? 0 : Math.max(tokenSortRatio(a, b), jaroWinkler(a, b)));
const simLoose = (a: string, b: string) => (!a || !b ? 0 : tokenSetRatio(a, b));

const nameVariants = (text: string) => [...new Set([looseName(text), romanized(text)].filter(Boolean))];
const best = (sim: (a: string, b: string) => number, qs: string[], cs: string[]) => Math.max(0, ...qs.flatMap((q) => cs.map((c) => sim(q, c))));

/* ------------------------------------------------------------------ artists */

const NO_EVIDENCE = new Set(['', 'release', 'release topic', 'unknown artist', 'various artists']);

function artistNames(artists: string | string[]): string[] {
  return (Array.isArray(artists) ? artists : [artists]).map((a) => String(a ?? '').trim()).filter((a) => !NO_EVIDENCE.has(romanized(a)));
}

function artistVariants(values: string[]): Set<string> {
  const out = new Set<string>();
  for (const v of values) {
    for (const x of [normalizeText(v), romanized(v)]) {
      if (!x) continue;
      out.add(x);
      out.add(x.replace(/ /g, ''));
      if (x.endsWith(' music') && x.split(' ').length >= 4) out.add(x.slice(0, -6));
    }
  }
  return out;
}

const splitCredits = (values: string[]) =>
  values.flatMap((v) =>
    v
      .split(/\s*(?:,|;|&|\b(?:feat|ft)\.?\s|\bfeaturing\s|\band\b|\bwith\b|\s[x×]\s)\s*/i)
      .map((p) => p.trim())
      .filter(Boolean),
  );

/** Whole performer credits must agree (a shared guest alone isn't enough; tribute acts never match). */
export function artistSimilarity(wanted: string | string[], candidate: string | string[]): number {
  const names = artistNames(wanted);
  const cands = artistNames(candidate);
  const tribute = /\b(?:tribute|karaoke|covers?|renditions?)\b/g;
  const lm = new Set(romanized(names.join(' ')).match(tribute) ?? []);
  const rm = new Set(romanized(cands.join(' ')).match(tribute) ?? []);
  if (lm.size !== rm.size || [...lm].some((m) => !rm.has(m))) return 0;
  const left = splitCredits(names);
  const right = splitCredits(cands);
  if (!left.length || !right.length) return 0;
  const joinedL = artistVariants([names.join(' ')]);
  if ([...artistVariants([cands.join(' ')])].some((v) => joinedL.has(v))) return 1;
  const sim = (a: Set<string>, b: Set<string>) => best(tokenSortRatio, [...a], [...b]);
  const allCredits = (l: string[], r: string[]) => {
    const rv = artistVariants(r);
    return Math.min(...l.map((n) => sim(artistVariants([n]), rv)));
  };
  return Math.max(allCredits(left, right), allCredits(right, left));
}

/* ------------------------------------------------------------------ scoring */

export interface MatchInput {
  title: string;
  artist: string | string[];
  durationMs?: number | null;
}

/** Score a search result against the wanted song: { score 0..1, ok: safe to use }. */
export function scoreCandidate(wanted: MatchInput, cand: MatchInput): { score: number; ok: boolean } {
  if (!recordingVersionsCompatible(wanted.title, wanted.artist, cand.title, cand.artist)) return { score: 0, ok: false };
  const artistSim = artistSimilarity(wanted.artist, cand.artist);
  const d1 = wanted.durationMs ?? null;
  const d2 = cand.durationMs ?? null;
  let durationScore = 0.5;
  let durationClose = false;
  if (d1 && d2) {
    const delta = Math.abs(d1 - d2);
    if (delta > CATALOG_DURATION_TOLERANCE_MS * 6) return { score: 0, ok: false };
    durationScore = Math.max(0, 1 - delta / (DURATION_TOLERANCE_MS * 4));
    durationClose = delta <= DURATION_TOLERANCE_MS;
  }
  const q = nameVariants(wanted.title);
  const c = nameVariants(cand.title);
  const nameStrict = best(simStrict, q, c);
  const nameSim = durationClose ? Math.max(nameStrict, best(simLoose, q, c)) : nameStrict;
  const score = 0.45 * nameSim + 0.35 * artistSim + 0.2 * durationScore;
  const strong = durationClose && nameSim >= 0.78 && artistSim >= FUZZY_THRESHOLD;
  const fuzzy = nameStrict >= 0.88 && artistSim >= FUZZY_THRESHOLD;
  return { score, ok: strong || fuzzy };
}

/** The best acceptable candidate, or null when none is safely the same recording. */
export function bestMatch<C>(wanted: MatchInput, candidates: C[], describe: (c: C) => MatchInput): C | null {
  let top: { c: C; score: number } | null = null;
  for (const c of candidates) {
    const r = scoreCandidate(wanted, describe(c));
    if (r.ok && (!top || r.score > top.score)) top = { c, score: r.score };
  }
  return top?.c ?? null;
}

/**
 * Online videos put the artist in the title ("Artist - Song (Official Audio)") and the channel in
 * the credit. Score those against the wanted song with the decoration removed.
 */
export function scoreVideo(wanted: MatchInput, video: { title: string; channel: string; durationMs?: number | null }) {
  const decor = /\s*[([](?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|lyric video|visuali[sz]er|hd|hq|4k|explicit|clean)[)\]]/gi;
  const cleanTitle = video.title.replace(decor, '').replace(/\s*\|.*$/, '').trim();
  const channel = video.channel.replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').trim();
  const dash = cleanTitle.split(/\s+[-–—]\s+/);
  const asPair = dash.length >= 2 ? { title: dash.slice(1).join(' - '), artist: dash[0] } : { title: cleanTitle, artist: channel };
  const viaPair = scoreCandidate(wanted, { ...asPair, durationMs: video.durationMs });
  const viaChannel = scoreCandidate(wanted, { title: cleanTitle, artist: channel, durationMs: video.durationMs });
  return viaPair.score >= viaChannel.score ? viaPair : viaChannel;
}
