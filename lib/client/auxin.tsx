/* eslint-disable @next/next/no-img-element */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, del, post, errorMessage } from './api';
import type { NowPlaying, Track } from '../types';
import { TimeShift } from './timeShift';
import { setPreviewDuck } from './preview';
import { IconPause, IconPlay, IconSkip } from '@/components/Icons';
import { AuxPlayer } from '@/components/AuxPlayer';

export interface AuxInfo {
  venueId: string;
  venueName: string;
  imageUrl: string | null;
  enabled: boolean;
  stream: { id: string; zone: string; startedAt: string } | null;
  dayPassCents: number;
  monthPassCents: number;
  memberPerk: boolean;
  pass: { kind: 'DAY' | 'MONTH' | 'MEMBER'; validUntil: string } | null;
  onSite: boolean;
  performanceId: string | null;
  nowPlaying: NowPlaying | null;
}

export interface Person {
  userName: string;
  avatarUrl: string | null;
  ring: string;
}

/** A song that played in the set (the set's playlist). */
export interface PlaylistEntry {
  id: string;
  track: Track;
  requestId: string | null;
  startedAt: string;
  endedAt: string | null;
  requestedBy: Person | null;
}

export interface UpNextEntry {
  requestId: string;
  track: Track;
  votes: number;
  requestedBy: Person | null;
}

export interface SetPlaylist {
  live: boolean;
  nowPlaying: NowPlaying | null;
  played: PlaylistEntry[];
  upNext: UpNextEntry[];
}

/**
 * What this listener hears: the venue feed live, their phone's own recording of it (exactly what
 * the DJ played, for songs since they tuned in), or a 30-second preview (songs from before they
 * tuned in, or a finished set's playlist).
 */
export type Source = 'live' | 'recording' | 'preview';

type Status = 'idle' | 'connecting' | 'live' | 'paused' | 'error';
interface AuxState {
  status: Status;
  venueId: string | null;
  venueName: string;
  zone: string;
  performanceId: string | null;
  nowPlaying: NowPlaying | null;
  error: string | null;
  /** How far behind the live feed this listener is (0 = live). */
  behindMs: number;
  /** This phone can rewind (it records the feed it receives). */
  canRewind: boolean;
  source: Source;
  /** The playlist entry playing as a preview. */
  previewOf: string | null;
  /** No live feed: a finished set's playlist. */
  playlistOnly: boolean;
}

export interface PositionInfo {
  entry: PlaylistEntry | null;
  elapsedMs: number;
  durationMs: number;
}

interface AuxCtx extends AuxState {
  listen: (info: AuxInfo) => Promise<void>;
  /** A finished set: step through its playlist (previews). */
  openPlaylist: (performanceId: string, venueName: string) => Promise<void>;
  stop: () => void;
  resume: () => void;
  pause: () => void;
  /** Back to the start of this song; again for the song before. */
  back: () => void;
  /** On to the next song, then back to live. */
  forward: () => void;
  goLive: () => void;
  /** Play a song from the set's playlist. */
  jumpTo: (entry: PlaylistEntry) => void;
  /** Jump within the song that's playing (0..1). */
  seek: (fraction: number) => void;
  playlist: SetPlaylist | null;
  /** The playlist with the song on now as its last entry. */
  entries: PlaylistEntry[];
  /** The song at the point this listener is hearing (live, rewound or preview). */
  hearing: Track | null;
  info: () => PositionInfo;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  volume: number;
  setVolume: (v: number) => void;
}

const IDLE: AuxState = {
  status: 'idle',
  venueId: null,
  venueName: '',
  zone: '',
  performanceId: null,
  nowPlaying: null,
  error: null,
  behindMs: 0,
  canRewind: false,
  source: 'live',
  previewOf: null,
  playlistOnly: false,
};
/** Within this of live counts as live. */
const LIVE_SLACK_MS = 3000;
const LIVE_ID = 'live-now';
const same = (a: Track, b: Track) => a.title.toLowerCase() === b.title.toLowerCase() && a.artist.toLowerCase() === b.artist.toLowerCase();

const Ctx = createContext<AuxCtx | null>(null);
export const useAuxIn = () => useContext(Ctx)!;

/** Ask for an Opus stereo, high-bitrate stream (music, not voice). SDP lines end in \r\n, so stop before the \r. */
function musicSdp(sdp: string) {
  return sdp.replace(/a=fmtp:(\d+) ([^\r\n]*useinbandfec=1[^\r\n]*)/g, (_m, pt, rest) => `a=fmtp:${pt} ${rest};stereo=1;sprop-stereo=1;maxaveragebitrate=128000`);
}

export function waitForIce(pc: RTCPeerConnection, ms = 2500) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const t = setTimeout(resolve, ms);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

function quickPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { timeout: 4000, maximumAge: 120_000 });
  });
}

/** The playlist with the song on now (if it's not logged yet) as the last entry. */
function withNow(pl: SetPlaylist | null, np: NowPlaying | null): PlaylistEntry[] {
  const played = pl?.played ?? [];
  if (!np) return played;
  const last = played[played.length - 1];
  if (last && same(last.track, np.track) && Math.abs(new Date(last.startedAt).getTime() - new Date(np.startedAt).getTime()) < 30_000) return played;
  return [...played, { id: LIVE_ID, track: np.track, requestId: np.requestId ?? null, startedAt: np.startedAt, endedAt: null, requestedBy: null }];
}

async function previewFor(t: Track): Promise<string | null> {
  if (t.previewUrl) return t.previewUrl;
  const q = new URLSearchParams({ title: t.title, artist: t.artist, duration: String(t.durationSec) });
  return (await api<{ previewUrl: string | null }>(`/api/music/preview?${q}`).catch(() => null))?.previewUrl ?? null;
}

export function AuxInProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuxState>(IDLE);
  const [volume, setVolumeState] = useState(1);
  const [playlist, setPlaylist] = useState<SetPlaylist | null>(null);
  const [expanded, setExpanded] = useState(false);
  const pc = useRef<RTCPeerConnection | null>(null);
  const peerId = useRef<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const liveStream = useRef<MediaStream | null>(null);
  const shift = useRef<TimeShift | null>(null);
  const source = useRef<Source>('live');
  const previewEntry = useRef<PlaylistEntry | null>(null);
  const pausedAt = useRef<number | null>(null);
  /** True while the player swaps sources (that pause isn't the listener's). */
  const switching = useRef(false);
  const entriesRef = useRef<PlaylistEntry[]>([]);
  const nowRef = useRef<NowPlaying | null>(null);

  const entries = useMemo(() => withNow(playlist, state.nowPlaying), [playlist, state.nowPlaying]);
  entriesRef.current = entries;
  nowRef.current = state.nowPlaying;

  const clearTimers = () => {
    timers.current.forEach(clearInterval);
    timers.current = [];
  };

  const stop = useCallback(() => {
    clearTimers();
    if (peerId.current) del(`/api/auxin/peers/${peerId.current}`).catch(() => undefined);
    peerId.current = null;
    pc.current?.close();
    pc.current = null;
    shift.current?.dispose();
    shift.current = null;
    liveStream.current = null;
    source.current = 'live';
    previewEntry.current = null;
    pausedAt.current = null;
    setPlaylist(null);
    setExpanded(false);
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
      audio.current.removeAttribute('src');
    }
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
    setState(IDLE);
  }, []);

  /** Back to the live feed. */
  const goLive = useCallback(() => {
    const el = audio.current;
    if (!el || !liveStream.current) return;
    source.current = 'live';
    previewEntry.current = null;
    pausedAt.current = null;
    switching.current = true;
    el.removeAttribute('src');
    el.srcObject = liveStream.current;
    el.play()
      .then(
        () => setState((s) => ({ ...s, status: 'live', behindMs: 0, source: 'live', previewOf: null })),
        () => setState((s) => ({ ...s, status: 'paused', behindMs: 0, source: 'live', previewOf: null })),
      )
      .finally(() => (switching.current = false));
  }, []);

  /** Play this listener's own recording from wall-clock time `at` (or live, if that's now). */
  const seekTo = useCallback(
    async (at: number) => {
      const el = audio.current;
      const ts = shift.current;
      if (!el) return;
      if (!ts?.ready || at >= Date.now() - LIVE_SLACK_MS) return goLive();
      const from = Math.max(at, ts.startedAt);
      try {
        source.current = 'recording';
        previewEntry.current = null;
        switching.current = true;
        await ts.playFrom(el, from);
        pausedAt.current = null;
        setState((s) => ({ ...s, status: 'live', behindMs: Date.now() - from, source: 'recording', previewOf: null }));
      } catch {
        goLive();
      } finally {
        switching.current = false;
      }
    },
    [goLive],
  );

  /** A song this phone didn't hear: its 30-second preview. */
  const playPreview = useCallback(async (entry: PlaylistEntry) => {
    const el = audio.current;
    if (!el) return;
    const url = await previewFor(entry.track);
    if (!url) {
      setState((s) => ({ ...s, error: `No preview for “${entry.track.title}”.` }));
      return;
    }
    source.current = 'preview';
    previewEntry.current = entry;
    pausedAt.current = null;
    switching.current = true;
    // Show the song straight away; the clip starts as soon as it has loaded.
    setState((s) => ({ ...s, status: 'live', source: 'preview', previewOf: entry.id, error: null, behindMs: Math.max(s.behindMs, Date.now() - new Date(entry.startedAt).getTime()) }));
    el.srcObject = null;
    el.src = url;
    try {
      await el.play();
    } catch {
      if (previewEntry.current === entry) setState((s) => ({ ...s, status: 'paused' }));
    } finally {
      switching.current = false;
    }
  }, []);

  /** Where this listener is in the night: now, the moment they're replaying, or the previewed song's start. */
  const position = useCallback(() => {
    if (pausedAt.current) return pausedAt.current;
    if (source.current === 'recording' && shift.current && audio.current) return shift.current.position(audio.current);
    if (source.current === 'preview' && previewEntry.current) return new Date(previewEntry.current.startedAt).getTime();
    return Date.now();
  }, []);

  const indexAt = useCallback((pos: number) => {
    const list = entriesRef.current;
    if (source.current === 'preview' && previewEntry.current) return list.findIndex((e) => e.id === previewEntry.current!.id);
    let i = -1;
    list.forEach((e, k) => {
      if (new Date(e.startedAt).getTime() <= pos) i = k;
    });
    return i;
  }, []);

  const jumpTo = useCallback(
    (entry: PlaylistEntry) => {
      const list = entriesRef.current;
      const isNow = entry.id === LIVE_ID || entry === list[list.length - 1];
      const start = new Date(entry.startedAt).getTime();
      const recorded = !!shift.current?.ready && start >= shift.current.startedAt - 1500;
      if (liveStream.current && recorded) return seekTo(start);
      // The song on now, started before this phone tuned in: stay live with it.
      if (liveStream.current && isNow) return goLive();
      return playPreview(entry);
    },
    [seekTo, goLive, playPreview],
  );

  const lastBack = useRef(0);
  const back = useCallback(() => {
    const list = entriesRef.current;
    const pos = position();
    const i = indexAt(pos);
    if (i < 0) return list.length ? jumpTo(list[list.length - 1]) : undefined;
    const elapsed = source.current === 'preview' ? (audio.current?.currentTime ?? 0) * 1000 : pos - new Date(list[i].startedAt).getTime();
    // The start of this song; pressing again straight after goes to the song before.
    const again = Date.now() - lastBack.current < 5000;
    lastBack.current = Date.now();
    if (elapsed > 3000 && !again) return source.current === 'preview' ? playPreview(list[i]) : jumpTo(list[i]);
    if (i > 0) return jumpTo(list[i - 1]);
    return source.current === 'preview' ? playPreview(list[0]) : jumpTo(list[0]);
  }, [position, indexAt, jumpTo, playPreview]);

  const forward = useCallback(() => {
    const list = entriesRef.current;
    const i = indexAt(position());
    const next = list[i + 1];
    if (!next) return liveStream.current ? goLive() : undefined;
    // On to the song playing now: that's live.
    if (liveStream.current && i + 1 === list.length - 1 && nowRef.current) return goLive();
    jumpTo(next);
  }, [position, indexAt, jumpTo, goLive]);

  const seek = useCallback(
    (fraction: number) => {
      const el = audio.current;
      if (!el) return;
      const f = Math.min(1, Math.max(0, fraction));
      if (source.current === 'preview') {
        if (Number.isFinite(el.duration)) el.currentTime = f * el.duration;
        return;
      }
      const list = entriesRef.current;
      const entry = list[indexAt(position())];
      if (!entry) return;
      seekTo(new Date(entry.startedAt).getTime() + f * entry.track.durationSec * 1000);
    },
    [indexAt, position, seekTo],
  );

  const pause = useCallback(() => {
    pausedAt.current = source.current === 'preview' ? null : position();
    audio.current?.pause();
  }, [position]);

  /** Carry on from where this listener paused (their own recording keeps going meanwhile). */
  const resume = useCallback(() => {
    const at = pausedAt.current;
    if (source.current !== 'preview' && at && shift.current?.ready && Date.now() - at > LIVE_SLACK_MS) {
      seekTo(at);
      return;
    }
    pausedAt.current = null;
    audio.current?.play().then(
      () => setState((s) => ({ ...s, status: 'live' })),
      () => undefined,
    );
  }, [seekTo]);

  const loadPlaylist = useCallback(async (performanceId: string) => {
    try {
      const pl = await api<SetPlaylist>(`/api/performances/${performanceId}/playlist`);
      setPlaylist(pl);
      setState((s) => ({ ...s, nowPlaying: pl.nowPlaying }));
    } catch {
      /* keep what we have */
    }
  }, []);

  const listen = useCallback(
    async (info: AuxInfo) => {
      if (!info.stream) throw new Error('The venue feed is offline right now.');
      stop();
      setState({ ...IDLE, status: 'connecting', venueId: info.venueId, venueName: info.venueName, zone: info.stream.zone, nowPlaying: info.nowPlaying, performanceId: info.performanceId });
      try {
        // Unlock audio playback inside the tap that started this.
        audio.current!.muted = false;
        audio.current!.play().catch(() => undefined);
        if (info.performanceId) loadPlaylist(info.performanceId);
        const { iceServers } = await api<{ iceServers: RTCIceServer[] }>('/api/auxin/ice');
        const conn = new RTCPeerConnection({ iceServers });
        pc.current = conn;
        conn.addTransceiver('audio', { direction: 'recvonly' });
        conn.ontrack = (e) => {
          const el = audio.current!;
          const live = e.streams[0] ?? new MediaStream([e.track]);
          liveStream.current = live;
          // Record what this phone receives, so this listener (only) can rewind it.
          shift.current?.dispose();
          shift.current = new TimeShift(live);
          shift.current.start();
          el.srcObject = live;
          el.play().then(
            () => setState((s) => ({ ...s, status: 'live', canRewind: !!shift.current?.supported })),
            () => setState((s) => ({ ...s, status: 'paused', canRewind: !!shift.current?.supported })),
          );
        };
        conn.onconnectionstatechange = () => {
          if (conn.connectionState === 'failed') setState((s) => ({ ...s, status: 'error', error: 'Lost the venue feed. Tap retry.' }));
        };
        const offer = await conn.createOffer();
        await conn.setLocalDescription({ type: 'offer', sdp: musicSdp(offer.sdp ?? '') });
        // Location (for the on-site check) while ICE candidates gather.
        const [pos] = await Promise.all([quickPosition(), waitForIce(conn)]);
        const joined = await post<{ peerId: string }>(`/api/auxin/streams/${info.stream.id}/join`, { offer: conn.localDescription!.sdp, lat: pos?.lat ?? null, lng: pos?.lng ?? null });
        peerId.current = joined.peerId;
        // Wait for the broadcaster's answer.
        const started = Date.now();
        let answered = false;
        while (!answered && Date.now() - started < 30_000 && pc.current === conn) {
          await new Promise((r) => setTimeout(r, 900));
          const r = await api<{ status: string; answer: string | null }>(`/api/auxin/peers/${joined.peerId}`);
          if (r.status === 'CLOSED') throw new Error("The venue's broadcaster couldn't connect you. Try again in a moment.");
          if (r.answer) {
            await conn.setRemoteDescription({ type: 'answer', sdp: r.answer });
            answered = true;
          }
        }
        if (!answered) throw new Error("The venue didn't pick up. Make sure their broadcaster is running and try again.");
        // Keep the listener counted, and the playlist / now playing fresh.
        timers.current.push(setInterval(() => peerId.current && api(`/api/auxin/peers/${peerId.current}`).catch(() => undefined), 30_000));
        timers.current.push(
          setInterval(async () => {
            try {
              const v = await api<AuxInfo>(`/api/auxin/venues/${info.venueId}`);
              setState((s) => ({ ...s, nowPlaying: v.nowPlaying }));
              if (v.performanceId) loadPlaylist(v.performanceId);
              // Someone rewound can finish what they're hearing; the live feed has ended.
              if (!v.stream && source.current === 'live') setState((s) => ({ ...s, status: 'error', error: 'The venue stopped the feed.' }));
            } catch {
              /* keep playing */
            }
          }, 8_000),
        );
        // How far behind live, for the player label.
        timers.current.push(
          setInterval(() => {
            if (source.current === 'recording' && !pausedAt.current) setState((s) => ({ ...s, behindMs: Math.max(0, Date.now() - position()) }));
          }, 1000),
        );
      } catch (err) {
        setState((s) => ({ ...s, status: 'error', error: errorMessage(err) }));
        pc.current?.close();
        pc.current = null;
        throw err;
      }
    },
    [stop, loadPlaylist, position],
  );

  /** A finished set: its playlist to step through (previews), no live feed. */
  const openPlaylist = useCallback(
    async (performanceId: string, venueName: string) => {
      stop();
      audio.current!.muted = false;
      const pl = await api<SetPlaylist>(`/api/performances/${performanceId}/playlist`);
      setPlaylist(pl);
      setState({ ...IDLE, status: 'paused', venueName, zone: 'Set playlist', performanceId, playlistOnly: true, source: 'preview' });
      setExpanded(true);
      if (pl.played[0]) {
        entriesRef.current = pl.played;
        await playPreview(pl.played[0]);
      }
    },
    [stop, playPreview],
  );

  /** The song at the point this listener is hearing. */
  const hearing = useMemo(() => {
    if (state.source === 'preview') return entries.find((e) => e.id === state.previewOf)?.track ?? null;
    if (state.source === 'live' && !pausedAt.current) return state.nowPlaying?.track ?? null;
    const pos = Date.now() - state.behindMs;
    const at = [...entries].reverse().find((e) => new Date(e.startedAt).getTime() <= pos);
    return at?.track ?? state.nowPlaying?.track ?? null;
  }, [entries, state.source, state.previewOf, state.behindMs, state.nowPlaying]);

  /** The song being heard and how far into it (for the progress bar). */
  const info = useCallback((): PositionInfo => {
    const list = entriesRef.current;
    const el = audio.current;
    if (source.current === 'preview' && previewEntry.current) {
      const d = el && Number.isFinite(el.duration) ? el.duration * 1000 : 30_000;
      return { entry: previewEntry.current, elapsedMs: (el?.currentTime ?? 0) * 1000, durationMs: d };
    }
    const pos = position();
    const entry = list[indexAt(pos)] ?? null;
    if (!entry) return { entry: null, elapsedMs: 0, durationMs: 0 };
    return { entry, elapsedMs: Math.max(0, pos - new Date(entry.startedAt).getTime()), durationMs: entry.track.durationSec * 1000 };
  }, [position, indexAt]);

  // Lock-screen / headphone controls (Media Session).
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (state.status === 'idle') return;
    const np = hearing;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: np?.title ?? `${state.venueName} live`,
      artist: np ? `${np.artist} · AUX IN` : 'AUX IN',
      album: `${state.venueName} — ${state.zone}`,
      artwork: np?.artwork ? [{ src: np.artwork, sizes: '600x600', type: 'image/jpeg' }] : [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.playbackState = state.status === 'live' ? 'playing' : 'paused';
    navigator.mediaSession.setActionHandler('play', resume);
    navigator.mediaSession.setActionHandler('pause', pause);
    navigator.mediaSession.setActionHandler('stop', stop);
    try {
      navigator.mediaSession.setActionHandler('previoustrack', back);
      navigator.mediaSession.setActionHandler('nexttrack', forward);
    } catch {
      /* older browsers */
    }
  }, [state.status, hearing, state.venueName, state.zone, resume, pause, back, forward, stop]);

  // Turn the venue feed down while someone previews a song to request.
  useEffect(() => {
    setPreviewDuck((on) => {
      if (audio.current) audio.current.volume = on ? Math.min(0.15, volume) : volume;
    });
    return () => setPreviewDuck(null);
  }, [volume]);

  const setVolume = (v: number) => {
    setVolumeState(v);
    if (audio.current) audio.current.volume = v;
  };

  const value = useMemo<AuxCtx>(
    () => ({ ...state, listen, openPlaylist, stop, resume, pause, back, forward, goLive, jumpTo, seek, playlist, entries, hearing, info, expanded, setExpanded, volume, setVolume }),
    [state, listen, openPlaylist, stop, resume, pause, back, forward, goLive, jumpTo, seek, playlist, entries, hearing, info, expanded, volume],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {expanded && state.status !== 'idle' && <AuxPlayer />}
      {/* Pauses by itself when earphones disconnect (the OS pauses media); the speakers keep going. */}
      <audio
        ref={audio}
        autoPlay
        playsInline
        className="hidden"
        onPause={() => {
          if (switching.current) return;
          // Earphones unplugged or paused from the lock screen: carry on from here when resumed.
          if (pausedAt.current === null && state.status === 'live' && source.current !== 'preview') pausedAt.current = position();
          setState((s) => (s.status === 'live' ? { ...s, status: 'paused' } : s));
        }}
        onPlay={() => setState((s) => (s.status === 'paused' ? { ...s, status: 'live' } : s))}
        onEnded={() => {
          // A preview finished: on to the next song in the playlist (or live).
          if (source.current === 'preview') return forward();
          // Reached the end of the recording so far: keep going from the same point (or live).
          if (source.current === 'recording' && shift.current && audio.current) seekTo(shift.current.position(audio.current));
        }}
      />
    </Ctx.Provider>
  );
}

export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Mini player above the bottom nav while you're listening in. Tap it for the full player. */
export function AuxMiniPlayer() {
  const a = useAuxIn();
  if (!a || a.status === 'idle' || a.expanded) return null;
  const np = a.hearing;
  const behind = a.source !== 'live' || a.behindMs > LIVE_SLACK_MS;
  const ctl = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition active:scale-90 disabled:opacity-30';
  const label =
    a.status === 'connecting'
      ? 'Connecting…'
      : a.status === 'error'
        ? 'Offline'
        : a.playlistOnly
          ? 'Set playlist'
          : a.source === 'preview'
            ? 'Earlier tonight · preview'
            : a.status === 'paused'
              ? 'Paused'
              : behind
                ? `−${clock(a.behindMs)}`
                : 'Live';
  return (
    <div className="fixed inset-x-0 bottom-[calc(134px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[var(--app-w)] px-3">
      <div className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-black/85 px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <button type="button" onClick={() => a.setExpanded(true)} aria-label="Open the player" className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10">
            {np?.artwork ? <img src={np.artwork.replace('600x600', '120x120')} alt="" className="h-full w-full object-cover" /> : <span className="text-lg">🎧</span>}
            {a.status === 'live' && !behind && <span className="absolute right-0.5 top-0.5 h-2 w-2 animate-pulseGlow rounded-full bg-red-500" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-din text-[9.5px] font-bold uppercase tracking-[0.16em] text-lime">
              AUX IN · {a.venueName} · {label}
            </span>
            <span className="block truncate font-ui text-[13px] font-semibold text-white">{a.status === 'error' ? a.error : np ? `${np.title} — ${np.artist}` : `${a.zone} feed`}</span>
          </span>
        </button>
        {(a.status === 'live' || a.status === 'paused') && (
          <span className="flex shrink-0 items-center">
            <button type="button" onClick={a.back} aria-label="Back to the start of the song" className={ctl}>
              <IconSkip size={15} className="-scale-x-100" />
            </button>
            <button type="button" onClick={a.status === 'paused' ? a.resume : a.pause} aria-label={a.status === 'paused' ? 'Play' : 'Pause'} className={ctl}>
              {a.status === 'paused' ? <IconPlay size={17} /> : <IconPause size={17} />}
            </button>
            <button type="button" onClick={a.forward} disabled={!behind && !a.playlistOnly} aria-label="Next song" className={ctl}>
              <IconSkip size={15} />
            </button>
            {behind && !a.playlistOnly && (
              <button type="button" onClick={a.goLive} className="ml-0.5 rounded-full border border-red-400/70 px-2 py-1 font-din text-[10px] font-bold uppercase tracking-wider text-red-300">
                Live
              </button>
            )}
          </span>
        )}
        <button type="button" onClick={a.stop} aria-label="Stop listening" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white">
          ■
        </button>
      </div>
    </div>
  );
}
