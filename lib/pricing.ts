import type { PublicControls, Track } from './types';

/**
 * Request pricing comes from the artist's Creative Controls: a per-minute rate for songs up to
 * five minutes and a separate per-minute rate for longer songs. All amounts are returned in cents.
 */
export function songPriceCents(track: Pick<Track, 'durationSec'>, c: Pick<PublicControls, 'ratePerMinShort' | 'ratePerMinLong'>): number {
  const minutes = track.durationSec / 60;
  const rate = minutes <= 5 ? c.ratePerMinShort : c.ratePerMinLong;
  return Math.max(100, Math.round(minutes * rate * 100));
}

export function micPriceCents(c: Pick<PublicControls, 'micPrice'>): number {
  return Math.round(c.micPrice * 100);
}

export function requestPriceCents(
  kind: 'SONG' | 'MIC',
  track: Pick<Track, 'durationSec'> | null | undefined,
  c: Pick<PublicControls, 'ratePerMinShort' | 'ratePerMinLong' | 'micPrice' | 'mic'>,
): number {
  if (kind === 'SONG') return track ? songPriceCents(track, c) : 0;
  // "Yes +" lets the shout-out ride on a song: mic price plus the song.
  return micPriceCents(c) + (c.mic === 'YES_PLUS' && track ? songPriceCents(track, c) : 0);
}

export function exceedsMaxLength(track: Pick<Track, 'durationSec'>, c: Pick<PublicControls, 'maxSongLength'>): boolean {
  return track.durationSec > c.maxSongLength * 60;
}

/** Returns the first filtered word found in a message, if any. */
export function blockedWord(message: string, filters: string[]): string | null {
  const lower = message.toLowerCase();
  for (const word of filters) {
    const w = word.trim().toLowerCase();
    if (w && lower.includes(w)) return word;
  }
  return null;
}
