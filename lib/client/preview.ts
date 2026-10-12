/**
 * 30-second song previews while choosing a request: one at a time, app-wide. Tracks without a
 * preview clip get one from the matching recording in the Apple catalogue. AUX IN dips while a
 * preview plays so the two don't talk over each other.
 */
import { useSyncExternalStore } from 'react';
import { api } from './api';
import type { Track } from '../types';

export interface PreviewState {
  key: string | null;
  loading: boolean;
  progress: number;
}

const IDLE: PreviewState = { key: null, loading: false, progress: 0 };
let state: PreviewState = IDLE;
let audio: HTMLAudioElement | null = null;
let duck: ((on: boolean) => void) | null = null;
const subs = new Set<() => void>();
const set = (s: PreviewState) => {
  state = s;
  subs.forEach((f) => f());
};

export const previewKey = (t: Pick<Track, 'title' | 'artist'>) => `${t.title}|${t.artist}`.toLowerCase();

/** AUX IN registers how to turn itself down while a preview plays. */
export function setPreviewDuck(fn: ((on: boolean) => void) | null) {
  duck = fn;
}

export function stopPreview() {
  if (audio) {
    audio.pause();
    audio.src = '';
  }
  audio = null;
  if (state.key) duck?.(false);
  set(IDLE);
}

/** Play (or stop) the preview for a track. Rejects when there's no preview for it. */
export async function togglePreview(track: Track) {
  const key = previewKey(track);
  if (state.key === key) return stopPreview();
  stopPreview();
  set({ key, loading: true, progress: 0 });
  let url = track.previewUrl;
  if (!url) {
    const q = new URLSearchParams({ title: track.title, artist: track.artist, duration: String(track.durationSec) });
    url = (await api<{ previewUrl: string | null }>(`/api/music/preview?${q}`).catch(() => null))?.previewUrl ?? undefined;
  }
  if (state.key !== key) return; // another preview was tapped meanwhile
  if (!url) {
    set(IDLE);
    throw new Error(`No preview available for “${track.title}”.`);
  }
  const el = new Audio(url);
  audio = el;
  el.ontimeupdate = () => audio === el && set({ key, loading: false, progress: el.currentTime / (Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 30) });
  el.onended = () => audio === el && stopPreview();
  duck?.(true);
  try {
    await el.play();
    if (audio === el) set({ key, loading: false, progress: 0 });
  } catch {
    if (audio === el) stopPreview();
  }
}

export function usePreview(): PreviewState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
    () => IDLE,
  );
}
