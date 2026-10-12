import { useEffect, useState } from 'react';
import { useApi } from '@/lib/client/useApi';
import { api, del, post, put, errorMessage } from '@/lib/client/api';
import { currentPushEndpoint, disablePush, enablePush, isIosBrowser, pushSupport } from '@/lib/client/push';
import { useSession } from '@/lib/client/session';
import { rand } from '@/lib/format';
import { cx } from '@/lib/util';
import type { Track } from '@/lib/types';
import { Toggle } from './ui';
import { useToast } from './Toast';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Night-out guardrail: a spending limit per 12 hours. */
export function NightOutLimit() {
  const toast = useToast();
  const { refresh } = useSession();
  const { data, reload } = useApi<{ capCents: number | null; spentCents: number }>('/api/me/limits');
  const OPTIONS = [null, 100, 150, 250, 500];
  async function set(cap: number | null) {
    try {
      await put('/api/me/limits', { cap });
      await refresh();
      reload();
      toast(cap ? `Night-out limit set to ${rand(cap)} per 12 hours.` : 'Night-out limit removed.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }
  return (
    <div className="px-5 py-4">
      <p className="font-ui text-[14px] font-semibold text-white">Night-out limit</p>
      <p className="font-ui text-[12px] text-white/55">
        Most you can spend on requests in 12 hours.{data ? ` Spent so far: ${rand(data.spentCents / 100)}.` : ''}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {OPTIONS.map((o) => {
          const active = (data?.capCents ?? null) === (o === null ? null : o * 100);
          return (
            <button key={o ?? 'none'} type="button" onClick={() => set(o)} className={cx('rounded-full px-3.5 py-1.5 font-din text-[12px] font-bold', active ? 'bg-lime text-lime-ink' : 'bg-white/10 text-white/85')}>
              {o === null ? 'No limit' : `R${o}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Notifications: request alerts and the lock-screen "now playing" card. */
export function NotificationsRow() {
  const toast = useToast();
  const [on, setOn] = useState(false);
  const [support, setSupport] = useState<string>('default');
  useEffect(() => {
    setSupport(pushSupport());
    currentPushEndpoint().then((e) => setOn(!!e));
  }, []);
  async function toggle(v: boolean) {
    try {
      if (v) await enablePush();
      else await disablePush();
      setOn(v);
      toast(v ? 'Notifications on.' : 'Notifications off.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <span>
        <span className="block font-ui text-[14px] font-semibold text-white">Notifications</span>
        <span className="block font-ui text-[12px] text-white/55">
          {support === 'unsupported' && isIosBrowser() ? 'On iPhone: Share → Add to Home Screen, then open AUXED from there.' : 'Your request is playing, plus the live card on your lock screen.'}
        </span>
      </span>
      <Toggle checked={on} onChange={toggle} label="Notifications" />
    </div>
  );
}

interface Connections {
  available: { spotify: boolean; appleMusic: boolean; youtube: boolean };
  connections: { provider: 'SPOTIFY' | 'APPLE_MUSIC'; displayName: string | null; lastImportAt: string | null }[];
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Apple Music.'));
    document.head.appendChild(s);
  });
}

/** Spotify and Apple Music: import favourites (they power quick picks) and auto-queue. */
export function MusicConnections() {
  const toast = useToast();
  const { data, reload } = useApi<Connections>('/api/music/connections');
  const [busy, setBusy] = useState<string | null>(null);
  const spotify = data?.connections.find((c) => c.provider === 'SPOTIFY');
  const apple = data?.connections.find((c) => c.provider === 'APPLE_MUSIC');

  async function importSpotify() {
    setBusy('spotify');
    try {
      const r = await post<{ imported: number }>('/api/music/connections', { provider: 'SPOTIFY' });
      toast(`Imported ${r.imported} songs from Spotify.`, 'success');
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function connectApple() {
    setBusy('apple');
    try {
      const { developerToken, storefront } = await api<{ developerToken: string; storefront: string }>('/api/music/apple/token');
      await loadScript('https://js-cdn.music.apple.com/musickit/v3/musickit.js');
      const w = window as any;
      await new Promise((r) => (w.MusicKit ? r(null) : document.addEventListener('musickitloaded', () => r(null), { once: true })));
      const m = await w.MusicKit.configure({ developerToken, app: { name: 'AUXED', build: '1.0' } });
      await m.authorize();
      const [recent, heavy] = await Promise.all([
        m.api.music('/v1/me/recent/played/tracks', { limit: 30 }).catch(() => null),
        m.api.music('/v1/me/history/heavy-rotation', { limit: 10 }).catch(() => null),
      ]);
      const songs: any[] = [...(recent?.data?.data ?? []), ...(heavy?.data?.data ?? []).flatMap((x: any) => (x.type === 'songs' ? [x] : []))];
      const tracks: Track[] = songs
        .filter((s) => s?.attributes)
        .map((s) => ({
          title: s.attributes.name,
          artist: s.attributes.artistName,
          album: s.attributes.albumName,
          artwork: s.attributes.artwork?.url?.replace('{w}', '600').replace('{h}', '600'),
          durationSec: Math.round((s.attributes.durationInMillis ?? 0) / 1000),
          genre: s.attributes.genreNames?.[0],
          source: 'itunes',
          externalId: s.id,
        }));
      const r = await post<{ imported: number }>('/api/music/connections', { provider: 'APPLE_MUSIC', tracks });
      toast(`Imported ${r.imported} songs from Apple Music (${storefront.toUpperCase()}).`, 'success');
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(provider: 'SPOTIFY' | 'APPLE_MUSIC') {
    try {
      await del('/api/music/connections', { provider });
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <div id="music" className="px-5 py-4">
      <p className="font-ui text-[14px] font-semibold text-white">Music connections</p>
      <p className="font-ui text-[12px] text-white/55">Your favourites shape your quick-request picks. Hosts and venues can auto-queue requests.</p>
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-3 py-2.5">
          <img src="/integrations/spotify.png" alt="" className="h-8 w-8 rounded-lg" />
          <span className="min-w-0 flex-1">
            <span className="block font-ui text-[14px] font-semibold text-white">Spotify</span>
            <span className="block truncate font-ui text-[11.5px] text-white/55">{spotify ? `Connected as ${spotify.displayName}` : data?.available.spotify ? 'Not connected' : 'Not set up on this server yet'}</span>
          </span>
          {spotify ? (
            <>
              <button type="button" disabled={busy === 'spotify'} onClick={importSpotify} className="rounded-full bg-white/15 px-3 py-1.5 font-din text-[10.5px] font-bold uppercase text-white">
                Re-import
              </button>
              <button type="button" onClick={() => disconnect('SPOTIFY')} className="font-ui text-[11px] text-white/50">
                Remove
              </button>
            </>
          ) : (
            <a
              href="/api/music/connect/spotify?return=/profile"
              className={cx('rounded-full px-3 py-1.5 font-din text-[10.5px] font-bold uppercase', data?.available.spotify ? 'bg-[#1db954] text-black' : 'pointer-events-none bg-white/10 text-white/40')}
            >
              Connect
            </a>
          )}
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-3 py-2.5">
          <img src="/integrations/apple-music.png" alt="" className="h-8 w-8 rounded-lg" />
          <span className="min-w-0 flex-1">
            <span className="block font-ui text-[14px] font-semibold text-white">Apple Music</span>
            <span className="block truncate font-ui text-[11.5px] text-white/55">{apple ? 'Favourites imported' : data?.available.appleMusic ? 'Not connected' : 'Not set up on this server yet'}</span>
          </span>
          {apple && (
            <button type="button" onClick={() => disconnect('APPLE_MUSIC')} className="font-ui text-[11px] text-white/50">
              Remove
            </button>
          )}
          <button
            type="button"
            disabled={!data?.available.appleMusic || busy === 'apple'}
            onClick={connectApple}
            className="rounded-full bg-[#fa2d48] px-3 py-1.5 font-din text-[10.5px] font-bold uppercase text-white disabled:bg-white/10 disabled:text-white/40"
          >
            {apple ? 'Re-import' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
