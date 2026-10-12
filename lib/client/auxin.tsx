/* eslint-disable @next/next/no-img-element */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, del, post, errorMessage } from './api';
import type { NowPlaying, Track } from '../types';
import { TimeShift } from './timeShift';
import { setPreviewDuck } from './preview';
import { IconPause, IconPlay, IconSkip } from '@/components/Icons';

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

type Status = 'idle' | 'connecting' | 'live' | 'paused' | 'error';
interface AuxState {
  status: Status;
  venueId: string | null;
  venueName: string;
  zone: string;
  nowPlaying: NowPlaying | null;
  error: string | null;
  /** How far behind the live feed this listener is (0 = live). */
  behindMs: number;
  /** This phone can rewind (it records the feed it receives). */
  canRewind: boolean;
}

/** A song the venue played while this person was tuned in, and when it started. */
interface Heard {
  track: Track;
  at: number;
}

interface AuxCtx extends AuxState {
  listen: (info: AuxInfo) => Promise<void>;
  stop: () => void;
  resume: () => void;
  pause: () => void;
  /** Back to the start of this song; again for the song before. */
  back: () => void;
  /** On to the next song, then back to live. */
  forward: () => void;
  goLive: () => void;
  /** The song at the point this listener is hearing (live or rewound). */
  hearing: Track | null;
  volume: number;
  setVolume: (v: number) => void;
}

const IDLE: AuxState = { status: 'idle', venueId: null, venueName: '', zone: '', nowPlaying: null, error: null, behindMs: 0, canRewind: false };
/** Within this of live counts as live. */
const LIVE_SLACK_MS = 3000;
const sameSong = (a: Track, b: Track) => a.title === b.title && a.artist === b.artist;

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

export function AuxInProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuxState>(IDLE);
  const [volume, setVolumeState] = useState(1);
  const [heard, setHeard] = useState<Heard[]>([]);
  const pc = useRef<RTCPeerConnection | null>(null);
  const peerId = useRef<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const liveStream = useRef<MediaStream | null>(null);
  const shift = useRef<TimeShift | null>(null);
  /** 'replay' while this listener is behind live. */
  const mode = useRef<'live' | 'replay'>('live');
  const pausedAt = useRef<number | null>(null);
  /** True while the player swaps between the live feed and the recording (its pause isn't the listener's). */
  const switching = useRef(false);
  const heardRef = useRef<Heard[]>([]);

  /** Remember each song as the venue moves on, so back/forward can find song starts. */
  const noteNowPlaying = useCallback((np: NowPlaying | null) => {
    if (!np) return;
    const list = heardRef.current;
    const last = list[list.length - 1];
    if (last && sameSong(last.track, np.track)) return;
    heardRef.current = [...list, { track: np.track, at: new Date(np.startedAt).getTime() }].slice(-200);
    setHeard(heardRef.current);
  }, []);

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
    mode.current = 'live';
    pausedAt.current = null;
    heardRef.current = [];
    setHeard([]);
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
    mode.current = 'live';
    pausedAt.current = null;
    switching.current = true;
    el.removeAttribute('src');
    el.srcObject = liveStream.current;
    el.play()
      .then(
        () => setState((s) => ({ ...s, status: 'live', behindMs: 0 })),
        () => setState((s) => ({ ...s, status: 'paused', behindMs: 0 })),
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
        mode.current = 'replay';
        switching.current = true;
        await ts.playFrom(el, from);
        pausedAt.current = null;
        setState((s) => ({ ...s, status: 'live', behindMs: Date.now() - from }));
      } catch {
        goLive();
      } finally {
        switching.current = false;
      }
    },
    [goLive],
  );

  /** Where this listener is in the night: now, or the moment they're replaying. */
  const position = useCallback(() => {
    if (pausedAt.current) return pausedAt.current;
    if (mode.current === 'replay' && shift.current && audio.current) return shift.current.position(audio.current);
    return Date.now();
  }, []);

  const back = useCallback(() => {
    const pos = position();
    const starts = heardRef.current.map((h) => h.at).filter((at) => at < pos - 3000);
    // The start of this song; pressing again within 3 seconds of a start goes to the one before.
    seekTo(starts.length ? starts[starts.length - 1] : pos - 30_000);
  }, [position, seekTo]);

  const forward = useCallback(() => {
    const pos = position();
    const next = heardRef.current.map((h) => h.at).find((at) => at > pos + 1000);
    if (next !== undefined) seekTo(next);
    else goLive();
  }, [position, seekTo, goLive]);

  const pause = useCallback(() => {
    pausedAt.current = position();
    audio.current?.pause();
  }, [position]);

  /** Carry on from where this listener paused (their own recording keeps going meanwhile). */
  const resume = useCallback(() => {
    const at = pausedAt.current;
    if (at && shift.current?.ready && Date.now() - at > LIVE_SLACK_MS) {
      seekTo(at);
      return;
    }
    pausedAt.current = null;
    audio.current?.play().then(
      () => setState((s) => ({ ...s, status: 'live' })),
      () => undefined,
    );
  }, [seekTo]);

  const listen = useCallback(
    async (info: AuxInfo) => {
      if (!info.stream) throw new Error('The venue feed is offline right now.');
      stop();
      setState({ ...IDLE, status: 'connecting', venueId: info.venueId, venueName: info.venueName, zone: info.stream.zone, nowPlaying: info.nowPlaying });
      noteNowPlaying(info.nowPlaying);
      try {
        // Unlock audio playback inside the tap that started this.
        audio.current!.muted = false;
        audio.current!.play().catch(() => undefined);
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
        // Keep the listener counted, and the now-playing card fresh.
        timers.current.push(setInterval(() => peerId.current && api(`/api/auxin/peers/${peerId.current}`).catch(() => undefined), 30_000));
        timers.current.push(
          setInterval(async () => {
            try {
              const v = await api<AuxInfo>(`/api/auxin/venues/${info.venueId}`);
              noteNowPlaying(v.nowPlaying);
              setState((s) => ({ ...s, nowPlaying: v.nowPlaying }));
              // Someone rewound can finish what they're hearing; the live feed has ended.
              if (!v.stream && mode.current === 'live') setState((s) => ({ ...s, status: 'error', error: 'The venue stopped the feed.' }));
            } catch {
              /* keep playing */
            }
          }, 10_000),
        );
        // How far behind live, for the player label.
        timers.current.push(
          setInterval(() => {
            if (mode.current === 'replay' && !pausedAt.current) setState((s) => ({ ...s, behindMs: Math.max(0, Date.now() - position()) }));
          }, 1000),
        );
      } catch (err) {
        setState((s) => ({ ...s, status: 'error', error: errorMessage(err) }));
        pc.current?.close();
        pc.current = null;
        throw err;
      }
    },
    [stop, noteNowPlaying, position],
  );

  /** The song at the point this listener is hearing. */
  const hearing = useMemo(() => {
    if (mode.current === 'live' && !pausedAt.current) return state.nowPlaying?.track ?? null;
    const pos = Date.now() - state.behindMs;
    const at = [...heard].reverse().find((h) => h.at <= pos);
    return at?.track ?? state.nowPlaying?.track ?? null;
  }, [heard, state.behindMs, state.nowPlaying]);

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
      navigator.mediaSession.setActionHandler('previoustrack', state.canRewind ? back : null);
      navigator.mediaSession.setActionHandler('nexttrack', state.canRewind ? forward : null);
    } catch {
      /* older browsers */
    }
  }, [state.status, hearing, state.venueName, state.zone, state.canRewind, resume, pause, back, forward, stop]);

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
    () => ({ ...state, listen, stop, resume, pause, back, forward, goLive, hearing, volume, setVolume }),
    [state, listen, stop, resume, pause, back, forward, goLive, hearing, volume],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Pauses by itself when earphones disconnect (the OS pauses media); the speakers keep going. */}
      <audio
        ref={audio}
        autoPlay
        playsInline
        className="hidden"
        onPause={() => {
          if (switching.current) return;
          // Earphones unplugged or paused from the lock screen: carry on from here when resumed.
          if (pausedAt.current === null && state.status === 'live') pausedAt.current = position();
          setState((s) => (s.status === 'live' ? { ...s, status: 'paused' } : s));
        }}
        onPlay={() => setState((s) => (s.status === 'paused' ? { ...s, status: 'live' } : s))}
        onEnded={() => {
          // Reached the end of the recording so far: keep going from the same point (or live).
          if (mode.current === 'replay' && shift.current && audio.current) seekTo(shift.current.position(audio.current));
        }}
      />
    </Ctx.Provider>
  );
}

/** Mini player above the bottom nav while you're listening in. */
const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function AuxMiniPlayer() {
  const a = useAuxIn();
  if (!a || a.status === 'idle') return null;
  const np = a.hearing;
  const behind = a.behindMs > LIVE_SLACK_MS;
  const ctl = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition active:scale-90 disabled:opacity-30';
  return (
    <div className="fixed inset-x-0 bottom-[calc(134px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[var(--app-w)] px-3">
      <div className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-black/85 px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10">
          {np?.artwork ? <img src={np.artwork.replace('600x600', '120x120')} alt="" className="h-full w-full object-cover" /> : <span className="text-lg">🎧</span>}
          {a.status === 'live' && !behind && <span className="absolute right-0.5 top-0.5 h-2 w-2 animate-pulseGlow rounded-full bg-red-500" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-din text-[9.5px] font-bold uppercase tracking-[0.16em] text-lime">
            AUX IN · {a.venueName} · {a.status === 'connecting' ? 'Connecting…' : a.status === 'paused' ? 'Paused' : a.status === 'error' ? 'Offline' : behind ? `−${clock(a.behindMs)}` : 'Live'}
          </span>
          <span className="block truncate font-ui text-[13px] font-semibold text-white">{a.status === 'error' ? a.error : np ? `${np.title} — ${np.artist}` : `${a.zone} feed`}</span>
        </span>
        {(a.status === 'live' || a.status === 'paused') && (
          <span className="flex shrink-0 items-center">
            {a.canRewind && (
              <button type="button" onClick={a.back} aria-label="Back to the start of the song" className={ctl}>
                <IconSkip size={15} className="-scale-x-100" />
              </button>
            )}
            <button type="button" onClick={a.status === 'paused' ? a.resume : a.pause} aria-label={a.status === 'paused' ? 'Play' : 'Pause'} className={ctl}>
              {a.status === 'paused' ? <IconPlay size={17} /> : <IconPause size={17} />}
            </button>
            {a.canRewind && (
              <button type="button" onClick={a.forward} disabled={!behind} aria-label="Next song" className={ctl}>
                <IconSkip size={15} />
              </button>
            )}
            {behind && (
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
