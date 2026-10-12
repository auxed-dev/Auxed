/* eslint-disable @next/next/no-img-element */
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { clock, useAuxIn, type PlaylistEntry, type UpNextEntry } from '@/lib/client/auxin';
import { api, post, errorMessage } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import { cx } from '@/lib/util';
import type { Track } from '@/lib/types';
import { IconChevronDown, IconDots, IconHeart, IconNote, IconPause, IconPlay, IconSkip, IconUp } from './Icons';
import { Avatar } from './ui';
import { useToast } from './Toast';

const favKey = (t: Track) => `${t.title}|${t.artist}`.toLowerCase();
const timeOfDay = (iso: string) => new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

/**
 * The full AUX IN player (tap the mini player): album art, the song, back / play / forward, skip to
 * live, and the set's playlist — what's played tonight and the requests up next.
 */
export function AuxPlayer() {
  const a = useAuxIn();
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const [, tick] = useState(0);
  const [allPlayed, setAllPlayed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [favs, setFavs] = useState<Set<string>>(new Set());

  // Progress bar and "behind live" move every half second.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!user) return;
    api<{ keys: string[] }>('/api/me/favorites?keys=1')
      .then((r) => setFavs(new Set(r.keys)))
      .catch(() => undefined);
  }, [user]);

  const pos = a.info();
  const track = a.hearing ?? pos.entry?.track ?? null;
  const live = !a.playlistOnly && a.source === 'live' && a.status !== 'paused';
  const behind = !a.playlistOnly && (a.source !== 'live' || a.behindMs > 3000);
  const fraction = pos.durationMs ? Math.min(1, pos.elapsedMs / pos.durationMs) : 0;
  const entries = a.entries;
  const currentId = pos.entry?.id ?? null;
  const shown = allPlayed ? entries : entries.slice(-5);
  const requester = pos.entry?.requestedBy;

  async function toggleFav() {
    if (!track) return;
    if (!user) return toast('Log in to save songs to your Treasure Box.', 'error');
    try {
      await post('/api/me/favorites', { track, performanceId: a.performanceId });
      setFavs((f) => {
        const n = new Set(f);
        if (n.has(favKey(track))) n.delete(favKey(track));
        else n.add(favKey(track));
        return n;
      });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function upvote(u: UpNextEntry) {
    try {
      await post(`/api/requests/${u.requestId}/vote`, { value: 1 });
      toast(`Upvoted “${u.track.title}”.`, 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  const request = () => {
    a.setExpanded(false);
    if (a.performanceId) router.push(`/sets/${a.performanceId}?request=1`);
  };

  const status = a.playlistOnly
    ? 'Set playlist'
    : a.source === 'preview'
      ? 'Earlier tonight · 30-second preview'
      : a.status === 'paused'
        ? 'Paused'
        : behind
          ? `${clock(a.behindMs)} behind live`
          : 'Live';

  return (
    <div data-theme="blue" className="fixed inset-0 z-[70] mx-auto flex max-w-[var(--app-w)] flex-col overflow-y-auto overscroll-contain text-white" style={{ background: 'radial-gradient(120% 50% at 50% -8%, #2a3cc9 0%, #121a66 38%, #05060f 72%), #05060f' }}>
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-5 pb-2 pt-[max(14px,env(safe-area-inset-top))]">
        <button type="button" onClick={() => a.setExpanded(false)} aria-label="Close the player" className="flex h-9 w-9 items-center justify-center rounded-full text-white/90">
          <IconChevronDown size={22} />
        </button>
        <span className="h-[5px] w-10 rounded-full bg-white/25" aria-hidden />
        <button type="button" onClick={() => setMenu((m) => !m)} aria-label="More" className="relative flex h-9 w-9 items-center justify-center rounded-full text-white/90">
          <IconDots size={20} />
        </button>
        {menu && (
          <div className="absolute right-4 top-[calc(max(14px,env(safe-area-inset-top))+44px)] z-20 w-[210px] overflow-hidden rounded-2xl border border-white/10 bg-black/90 backdrop-blur">
            {a.performanceId && (
              <button type="button" onClick={() => (a.setExpanded(false), router.push(`/sets/${a.performanceId}`))} className="block w-full px-4 py-3 text-left font-ui text-[14px] hover:bg-white/10">
                Open the set
              </button>
            )}
            {!a.playlistOnly && (
              <button type="button" onClick={request} className="block w-full px-4 py-3 text-left font-ui text-[14px] hover:bg-white/10">
                Request a song
              </button>
            )}
            <button type="button" onClick={() => (setMenu(false), a.stop())} className="block w-full px-4 py-3 text-left font-ui text-[14px] text-red-300 hover:bg-white/10">
              {a.playlistOnly ? 'Close the playlist' : 'Stop listening'}
            </button>
          </div>
        )}
      </div>

      {/* Album */}
      <div className="mx-auto mt-4 w-[66%]">
        <div className="relative aspect-square w-full overflow-hidden rounded-[30px] bg-white/10 shadow-[0_30px_80px_-24px_rgba(60,90,255,0.75)]">
          {track?.artwork ? <img src={track.artwork.replace('100x100', '600x600')} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-6xl">🎧</span>}
          {live && <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 font-din text-[10px] font-bold uppercase tracking-wider"><span className="h-2 w-2 animate-pulseGlow rounded-full bg-red-500" /> Live</span>}
        </div>
      </div>

      {/* Song */}
      <div className="mt-7 flex items-start justify-between gap-3 px-6">
        <div className="min-w-0">
          <p className="truncate font-ui text-[23px] leading-tight text-white">{track?.title ?? (a.status === 'connecting' ? 'Connecting…' : `${a.venueName} live`)}</p>
          <p className="mt-0.5 truncate font-ui text-[13px] text-white/75">{track?.artist ?? a.zone}</p>
        </div>
        {track && (
          <button type="button" onClick={toggleFav} aria-label={favs.has(favKey(track)) ? 'Remove from your Treasure Box' : 'Save to your Treasure Box'} className={cx('mt-1 shrink-0 transition active:scale-110', favs.has(favKey(track)) ? 'text-[#ff2d3d]' : 'text-white/85')}>
            <IconHeart size={22} fill={favs.has(favKey(track)) ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} />
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 px-6">
        <span className={cx('flex items-center gap-1.5 rounded-full px-3 py-1 font-ui text-[11px]', live ? 'bg-red-500/20 text-red-200' : 'bg-white/10 text-white/80')}>
          {live && <span className="h-1.5 w-1.5 rounded-full bg-red-400" />}
          {status}
        </span>
        <span className="rounded-full bg-white/10 px-3 py-1 font-ui text-[11px] text-white/80">AUX IN · {a.venueName}</span>
        {requester && (
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 py-0.5 pl-0.5 pr-3 font-ui text-[11px] text-white/80">
            <Avatar src={requester.avatarUrl} name={requester.userName} size={18} ring={requester.ring} /> Requested by @{requester.userName}
          </span>
        )}
      </div>

      {/* Progress */}
      <div className="mt-6 px-6">
        <button
          type="button"
          aria-label="Seek"
          disabled={a.playlistOnly ? false : !a.canRewind}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            a.seek((e.clientX - r.left) / r.width);
          }}
          className="relative block h-4 w-full"
        >
          <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/25" />
          <span className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white" style={{ width: `${fraction * 100}%` }} />
          <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${fraction * 100}%` }} />
        </button>
        <div className="mt-1 flex justify-between font-ui text-[11px] text-white/65">
          <span>{clock(pos.elapsedMs)}</span>
          <span>{pos.durationMs ? `-${clock(Math.max(0, pos.durationMs - pos.elapsedMs))}` : ''}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center justify-between px-6">
        <button type="button" onClick={request} disabled={a.playlistOnly} aria-label="Request a song" className="flex h-10 w-10 items-center justify-center rounded-full text-white/85 disabled:opacity-30">
          <IconNote size={20} />
        </button>
        <button type="button" onClick={a.back} aria-label="Back to the start of the song" className="flex h-12 w-12 items-center justify-center rounded-full text-white">
          <IconSkip size={24} className="-scale-x-100" />
        </button>
        <button type="button" onClick={a.status === 'paused' ? a.resume : a.pause} aria-label={a.status === 'paused' ? 'Play' : 'Pause'} className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-white text-[#0a0d2c] shadow-[0_8px_30px_rgba(255,255,255,0.25)] transition active:scale-95">
          {a.status === 'paused' ? <IconPlay size={26} className="translate-x-[2px]" /> : <IconPause size={26} />}
        </button>
        <button type="button" onClick={a.forward} disabled={!behind && !a.playlistOnly} aria-label="Next song" className="flex h-12 w-12 items-center justify-center rounded-full text-white disabled:opacity-30">
          <IconSkip size={24} />
        </button>
        <button type="button" onClick={a.goLive} disabled={a.playlistOnly || !behind} aria-label="Skip to live" className={cx('flex h-10 min-w-10 items-center justify-center rounded-full px-2 font-din text-[10px] font-bold uppercase tracking-wider', behind && !a.playlistOnly ? 'border border-red-400 text-red-300' : 'text-white/35')}>
          Live
        </button>
      </div>
      {behind && !a.playlistOnly && (
        <button type="button" onClick={a.goLive} className="mx-6 mt-5 flex h-[46px] items-center justify-center gap-2 rounded-full bg-red-600/90 font-din text-[13px] font-bold uppercase tracking-wider text-white shadow-[0_8px_24px_-8px_rgba(255,40,60,0.7)]">
          <span className="h-2 w-2 animate-pulseGlow rounded-full bg-white" /> Skip to live
        </button>
      )}
      {a.source === 'preview' && track && (
        <p className="mx-6 mt-4 font-ui text-[11.5px] leading-relaxed text-white/60">
          {a.playlistOnly ? 'Previews of the songs from this set.' : 'This played before you tuned in, so you hear a 30-second preview.'} Full song:{' '}
          {track.source === 'itunes' && track.externalId && (
            <a href={`https://music.apple.com/song/${track.externalId}`} target="_blank" rel="noreferrer" className="text-lime underline underline-offset-2">
              Apple Music
            </a>
          )}
          {track.source === 'itunes' && track.externalId && ' · '}
          <a href={`https://open.spotify.com/search/${encodeURIComponent(`${track.title} ${track.artist}`)}`} target="_blank" rel="noreferrer" className="text-lime underline underline-offset-2">
            Spotify
          </a>
        </p>
      )}

      {/* Played tonight */}
      <section className="relative mx-4 mt-8 rounded-[26px] border border-white/[0.07] bg-white/[0.05] px-4 pb-6 pt-4 backdrop-blur">
        <h3 className="mb-2 font-ui text-[15px] text-white">{a.playlistOnly ? 'Set playlist' : 'Played tonight'}</h3>
        {entries.length === 0 && <p className="py-4 font-ui text-[12px] text-white/50">Nothing has played yet.</p>}
        <ul>
          {shown.map((e) => (
            <PlaylistRow key={e.id} e={e} current={e.id === currentId} onPlay={() => a.jumpTo(e)} />
          ))}
        </ul>
        {entries.length > 5 && (
          <button type="button" onClick={() => setAllPlayed((v) => !v)} className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-[#0d1240] px-3.5 py-1 font-ui text-[11px] text-white/85">
            {allPlayed ? '– Show less' : `+ See all ${entries.length}`}
          </button>
        )}
      </section>

      {/* Up next */}
      {!a.playlistOnly && (
        <section className="mx-4 mt-6 rounded-[26px] border border-white/[0.07] bg-white/[0.05] px-4 pb-3 pt-4 backdrop-blur">
          <h3 className="mb-2 font-ui text-[15px] text-white">Up next</h3>
          {(a.playlist?.upNext.length ?? 0) === 0 && <p className="py-3 font-ui text-[12px] text-white/50">No approved requests waiting. Request one and it shows up here.</p>}
          <ul>
            {(a.playlist?.upNext ?? []).slice(0, 8).map((u) => (
              <li key={u.requestId} className="flex items-center gap-3 border-b border-white/[0.06] py-2.5 last:border-0">
                <Cover t={u.track} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-ui text-[13px] text-white">{u.track.title}</span>
                  <span className="block truncate font-ui text-[11px] text-white/55">
                    {u.track.artist}
                    {u.requestedBy ? ` · @${u.requestedBy.userName}` : ''}
                  </span>
                </span>
                <button type="button" onClick={() => upvote(u)} className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 font-din text-[11px] font-bold text-lime">
                  <IconUp size={11} /> {u.votes}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="h-[calc(40px+env(safe-area-inset-bottom))] shrink-0" />
    </div>
  );
}

function Cover({ t }: { t: Track }) {
  return t.artwork ? <img src={t.artwork.replace('600x600', '120x120')} alt="" className="h-11 w-11 shrink-0 rounded-[10px] object-cover" loading="lazy" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-white/10 text-white/60"><IconNote size={16} /></span>;
}

function PlaylistRow({ e, current, onPlay }: { e: PlaylistEntry; current: boolean; onPlay: () => void }) {
  return (
    <li>
      <button type="button" onClick={onPlay} className={cx('flex w-full items-center gap-3 border-b border-white/[0.06] py-2.5 text-left', current && 'rounded-xl bg-white/[0.07] px-2')}>
        <Cover t={e.track} />
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate font-ui text-[13px]', current ? 'text-lime' : 'text-white')}>{e.track.title}</span>
          <span className="block truncate font-ui text-[11px] text-white/55">
            {e.track.artist}
            {e.requestedBy ? ` · requested by @${e.requestedBy.userName}` : ''}
          </span>
        </span>
        <span className="shrink-0 font-ui text-[11px] text-white/55">{current ? <span className="font-din font-bold uppercase text-lime">Now</span> : timeOfDay(e.startedAt)}</span>
      </button>
    </li>
  );
}
