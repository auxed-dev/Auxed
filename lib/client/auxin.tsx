/* eslint-disable @next/next/no-img-element */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, del, post, errorMessage } from './api';
import type { NowPlaying } from '../types';

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
}

interface AuxCtx extends AuxState {
  listen: (info: AuxInfo) => Promise<void>;
  stop: () => void;
  resume: () => void;
  volume: number;
  setVolume: (v: number) => void;
}

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
  const [state, setState] = useState<AuxState>({ status: 'idle', venueId: null, venueName: '', zone: '', nowPlaying: null, error: null });
  const [volume, setVolumeState] = useState(1);
  const pc = useRef<RTCPeerConnection | null>(null);
  const peerId = useRef<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

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
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
    }
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
    setState({ status: 'idle', venueId: null, venueName: '', zone: '', nowPlaying: null, error: null });
  }, []);

  const resume = useCallback(() => {
    audio.current?.play().then(
      () => setState((s) => ({ ...s, status: 'live' })),
      () => undefined,
    );
  }, []);

  const listen = useCallback(
    async (info: AuxInfo) => {
      if (!info.stream) throw new Error('The venue feed is offline right now.');
      stop();
      setState({ status: 'connecting', venueId: info.venueId, venueName: info.venueName, zone: info.stream.zone, nowPlaying: info.nowPlaying, error: null });
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
          el.srcObject = e.streams[0] ?? new MediaStream([e.track]);
          el.play().then(
            () => setState((s) => ({ ...s, status: 'live' })),
            () => setState((s) => ({ ...s, status: 'paused' })),
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
              setState((s) => ({ ...s, nowPlaying: v.nowPlaying }));
              if (!v.stream) setState((s) => ({ ...s, status: 'error', error: 'The venue stopped the feed.' }));
            } catch {
              /* keep playing */
            }
          }, 15_000),
        );
      } catch (err) {
        setState((s) => ({ ...s, status: 'error', error: errorMessage(err) }));
        pc.current?.close();
        pc.current = null;
        throw err;
      }
    },
    [stop],
  );

  // Lock-screen / headphone controls (Media Session).
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (state.status === 'idle') return;
    const np = state.nowPlaying?.track;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: np?.title ?? `${state.venueName} live`,
      artist: np ? `${np.artist} · AUX IN` : 'AUX IN',
      album: `${state.venueName} — ${state.zone}`,
      artwork: np?.artwork ? [{ src: np.artwork, sizes: '600x600', type: 'image/jpeg' }] : [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.playbackState = state.status === 'live' ? 'playing' : 'paused';
    navigator.mediaSession.setActionHandler('play', resume);
    navigator.mediaSession.setActionHandler('pause', () => audio.current?.pause());
    navigator.mediaSession.setActionHandler('stop', stop);
  }, [state.status, state.nowPlaying, state.venueName, state.zone, resume, stop]);

  const setVolume = (v: number) => {
    setVolumeState(v);
    if (audio.current) audio.current.volume = v;
  };

  const value = useMemo<AuxCtx>(() => ({ ...state, listen, stop, resume, volume, setVolume }), [state, listen, stop, resume, volume]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Pauses by itself when earphones disconnect (the OS pauses media); the speakers keep going. */}
      <audio
        ref={audio}
        autoPlay
        playsInline
        className="hidden"
        onPause={() => setState((s) => (s.status === 'live' ? { ...s, status: 'paused' } : s))}
        onPlay={() => setState((s) => (s.status === 'paused' ? { ...s, status: 'live' } : s))}
      />
    </Ctx.Provider>
  );
}

/** Mini player above the bottom nav while you're listening in. */
export function AuxMiniPlayer() {
  const a = useAuxIn();
  if (!a || a.status === 'idle') return null;
  const np = a.nowPlaying?.track;
  return (
    <div className="fixed inset-x-0 bottom-[calc(134px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[var(--app-w)] px-3">
      <div className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-black/85 px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10">
          {np?.artwork ? <img src={np.artwork.replace('600x600', '120x120')} alt="" className="h-full w-full object-cover" /> : <span className="text-lg">🎧</span>}
          {a.status === 'live' && <span className="absolute right-0.5 top-0.5 h-2 w-2 animate-pulseGlow rounded-full bg-red-500" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-din text-[9.5px] font-bold uppercase tracking-[0.16em] text-lime">
            AUX IN · {a.venueName} · {a.status === 'connecting' ? 'Connecting…' : a.status === 'paused' ? 'Paused' : a.status === 'error' ? 'Offline' : 'Live'}
          </span>
          <span className="block truncate font-ui text-[13px] font-semibold text-white">{a.status === 'error' ? a.error : np ? `${np.title} — ${np.artist}` : `${a.zone} feed`}</span>
        </span>
        {a.status === 'paused' && (
          <button type="button" onClick={a.resume} className="rounded-full bg-lime px-3 py-1.5 font-din text-[11px] font-bold uppercase text-lime-ink">
            Resume
          </button>
        )}
        {a.status === 'live' && (
          <span className="w-[72px] shrink-0">
            <input type="range" min={0} max={1} step={0.05} value={a.volume} onChange={(e) => a.setVolume(Number(e.target.value))} aria-label="Volume" className="aux-range" />
          </span>
        )}
        <button type="button" onClick={a.stop} aria-label="Stop listening" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white">
          ■
        </button>
      </div>
    </div>
  );
}
