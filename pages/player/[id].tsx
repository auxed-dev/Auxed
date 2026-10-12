/* eslint-disable @next/next/no-img-element */
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuxedPage } from '../_app';
import { LogoA } from '@/components/Brand';
import { useToast } from '@/components/Toast';
import { api, post, errorMessage } from '@/lib/client/api';
import type { NowPlaying, Track } from '@/lib/types';

interface Item {
  requestId: string | null;
  track: Track;
  appleId: string | null;
  youtubeId: string | null;
}
interface PlayerData {
  provider: 'APPLE_MUSIC' | 'YOUTUBE';
  title: string;
  nowPlaying: NowPlaying | null;
  items: Item[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    MusicKit?: any;
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * AUXED Player: open this on the device connected to the speakers (venue laptop, TV, the host's
 * phone). It plays the request queue — highest votes first, then the set list — through Apple
 * Music (signed-in subscriber) or YouTube, and reports back so everyone sees what's playing.
 */
const Player: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const [data, setData] = useState<PlayerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState<Item | null>(null);
  const music = useRef<any>(null);
  const yt = useRef<any>(null);
  const playing = useRef<Item | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (!id) return null;
    try {
      const d = await api<PlayerData>(`/api/performances/${id}/player`);
      setData(d);
      setError(null);
      return d;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    }
  }, [id]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const report = useCallback(
    (event: 'started' | 'ended', item: Item) => post(`/api/performances/${id}/player`, { event, requestId: item.requestId, track: item.track }).catch(() => undefined),
    [id],
  );

  const playNext = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const d = await refresh();
      const next = d?.items[0];
      if (!d || !next) {
        playing.current = null;
        setCurrent(null);
        return;
      }
      if (d.provider === 'APPLE_MUSIC') {
        const m = music.current;
        let songId = next.appleId;
        if (!songId) {
          const r = await m.api.music(`/v1/catalog/${m.storefrontId || 'za'}/search`, { term: `${next.track.title} ${next.track.artist}`, types: 'songs', limit: 1 });
          songId = r?.data?.results?.songs?.data?.[0]?.id ?? null;
        }
        if (!songId) {
          toast(`“${next.track.title}” isn't on Apple Music — skipping.`, 'error');
          await report('started', next);
          await report('ended', next);
          busy.current = false;
          return playNext();
        }
        await m.setQueue({ song: songId, startPlaying: true });
      } else {
        if (!next.youtubeId) {
          toast(`Couldn't find “${next.track.title}” on YouTube — skipping.`, 'error');
          await report('started', next);
          await report('ended', next);
          busy.current = false;
          return playNext();
        }
        yt.current.loadVideoById(next.youtubeId);
      }
      playing.current = next;
      setCurrent(next);
      await report('started', next);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      busy.current = false;
    }
  }, [refresh, report, toast]);

  const ended = useCallback(async () => {
    const was = playing.current;
    playing.current = null;
    if (was) await report('ended', was);
    playNext();
  }, [report, playNext]);

  async function start() {
    if (!data) return;
    try {
      if (data.provider === 'APPLE_MUSIC') {
        const { developerToken } = await api<{ developerToken: string }>('/api/music/apple/token');
        await loadScript('https://js-cdn.music.apple.com/musickit/v3/musickit.js');
        await new Promise((r) => (window.MusicKit ? r(null) : document.addEventListener('musickitloaded', () => r(null), { once: true })));
        const m = await window.MusicKit.configure({ developerToken, app: { name: 'AUXED', build: '1.0' } });
        await m.authorize();
        music.current = m;
        m.addEventListener('playbackStateDidChange', (e: { state: number }) => {
          const S = window.MusicKit.PlaybackStates;
          if (playing.current && (e.state === S.completed || e.state === S.ended)) ended();
        });
      } else {
        await loadScript('https://www.youtube.com/iframe_api');
        await new Promise<void>((r) => (window.YT?.Player ? r() : (window.onYouTubeIframeAPIReady = () => r())));
        yt.current = await new Promise((resolve) => {
          const p = new window.YT.Player('yt-player', {
            width: '100%',
            height: '100%',
            playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
            events: {
              onReady: () => resolve(p),
              onStateChange: (e: { data: number }) => e.data === window.YT.PlayerState.ENDED && ended(),
            },
          });
        });
      }
      setStarted(true);
      playNext();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  function skip() {
    if (data?.provider === 'APPLE_MUSIC') music.current?.stop();
    else yt.current?.stopVideo();
    ended();
  }

  return (
    <div className="min-h-[100dvh] bg-black px-5 pb-10 pt-[max(24px,env(safe-area-inset-top))] text-white">
      <Head>
        <title>AUXED Player</title>
      </Head>
      <div className="mx-auto max-w-[900px]">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoA size={40} />
            <div>
              <p className="font-din text-[11px] font-bold uppercase tracking-[0.2em] text-lime">AUXED Player · {data?.provider === 'APPLE_MUSIC' ? 'Apple Music' : data?.provider === 'YOUTUBE' ? 'YouTube' : '…'}</p>
              <p className="font-wide text-[20px] font-black uppercase">{data?.title ?? 'Loading…'}</p>
            </div>
          </div>
          {id && (
            <Link href={`/sets/${id}`} className="rounded-full bg-white/10 px-4 py-2 font-din text-[12px] font-bold uppercase tracking-wider">
              Back to set
            </Link>
          )}
        </header>

        {error && <p className="mt-6 rounded-2xl border border-red-400/30 bg-red-950/60 px-4 py-3 font-ui text-[14px]">{error}</p>}

        <div className={data?.provider === 'YOUTUBE' ? 'mt-6 aspect-video w-full overflow-hidden rounded-[20px] bg-white/5' : 'hidden'}>
          <div id="yt-player" className="h-full w-full" />
        </div>

        {current && (
          <div className="mt-6 flex items-center gap-4 rounded-[24px] bg-white/[0.06] p-4">
            {current.track.artwork && <img src={current.track.artwork} alt="" className="h-24 w-24 rounded-2xl object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="font-din text-[11px] font-bold uppercase tracking-[0.2em] text-lime">{current.requestId ? 'Requested · now playing' : 'Set list · now playing'}</p>
              <p className="truncate font-din text-[26px] font-bold uppercase">{current.track.title}</p>
              <p className="truncate font-ui text-[16px] text-white/70">{current.track.artist}</p>
            </div>
            <button type="button" onClick={skip} className="rounded-full bg-white/15 px-5 py-3 font-din text-[13px] font-bold uppercase">
              Skip
            </button>
          </div>
        )}

        {!started && (
          <div className="mt-8 rounded-[24px] bg-white/[0.06] p-6 text-center">
            <p className="font-ui text-[15px] text-white/80">
              {data?.provider === 'APPLE_MUSIC'
                ? 'Sign in with an Apple Music subscription on this device, then leave this screen open — it plays the queue by itself.'
                : 'Leave this screen open on the device connected to the speakers — it finds each request on YouTube and plays it next.'}
            </p>
            <button type="button" disabled={!data} onClick={start} className="mt-5 h-[56px] w-full max-w-[320px] rounded-full bg-lime font-din text-[15px] font-bold uppercase tracking-wider text-lime-ink disabled:opacity-50">
              {data?.provider === 'APPLE_MUSIC' ? 'Sign in & start' : 'Start playing'}
            </button>
          </div>
        )}

        <h2 className="mt-8 font-din text-[13px] font-bold uppercase tracking-[0.16em] text-white/60">Up next</h2>
        <ul className="mt-3 space-y-2">
          {(data?.items ?? []).map((it, i) => (
            <li key={`${it.requestId ?? 'set'}-${i}`} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5">
              <span className="w-5 text-center font-din text-[13px] text-white/50">{i + 1}</span>
              {it.track.artwork ? <img src={it.track.artwork.replace('600x600', '100x100')} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="h-10 w-10 rounded-lg bg-white/10" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-din text-[14px] font-bold uppercase">{it.track.title}</span>
                <span className="block truncate font-ui text-[12px] text-white/60">{it.track.artist}</span>
              </span>
              <span className="font-din text-[10px] font-bold uppercase text-white/50">{it.requestId ? 'Request' : 'Set list'}</span>
            </li>
          ))}
          {data && !data.items.length && <li className="rounded-2xl bg-white/[0.04] px-4 py-4 text-center font-ui text-[13px] text-white/60">Nothing queued. Approved requests appear here.</li>}
        </ul>
      </div>
    </div>
  );
};

Player.auth = true;
export default Player;
