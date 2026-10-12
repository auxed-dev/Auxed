import { post } from './api';
import type { NowPlaying } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const cap = () => (typeof window !== 'undefined' ? (window as any).Capacitor : undefined);

/** True inside the native (Capacitor) app. */
export const isNativeApp = () => !!cap()?.isNativePlatform?.();

/**
 * Start the native lock-screen card (iOS Live Activity) for a set and register its push token so
 * the server can update it when the song changes. No-op on the web (the web uses push instead).
 */
export async function startLiveCard(performanceId: string, venue: string, np: NowPlaying | null) {
  const plugin = cap()?.Plugins?.LiveActivity;
  if (!plugin) return false;
  plugin.addListener('token', (e: { token: string }) => post('/api/push/native', { token: e.token, kind: 'IOS_LIVE_ACTIVITY', performanceId }).catch(() => undefined));
  await plugin.start({
    performanceId,
    apiBase: window.location.origin,
    title: np?.track.title ?? 'Live now',
    artist: np?.track.artist ?? '',
    venue,
    endsAt: np ? new Date(np.startedAt).getTime() / 1000 + np.track.durationSec : Date.now() / 1000 + 180,
  });
  return true;
}

export async function endLiveCard() {
  await cap()?.Plugins?.LiveActivity?.end?.();
}
