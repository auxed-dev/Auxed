/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useState } from 'react';
import { useApi } from '@/lib/client/useApi';
import { post, put, errorMessage, ApiError } from '@/lib/client/api';
import { useAuxIn, type AuxInfo } from '@/lib/client/auxin';
import { useSession } from '@/lib/client/session';
import { rand } from '@/lib/format';
import { cx } from '@/lib/util';
import type { PlaybackTarget, RoomDTO } from '@/lib/types';
import { Sheet } from './ui';
import { TopUpSheet } from './TopUpSheet';
import { useToast } from './Toast';

const QUICK = ['🔥', '🙌', '❤️', '💯'];
const LINES = ['This song 🔥', 'Play it again!', 'Turn it up 🔊', 'Who requested this? 🙏'];

/** One tap: react to what's playing or drop a quick line into the chat. */
export function NowPlayingReactions({ performanceId, onSent }: { performanceId: string; onSent: () => void }) {
  const toast = useToast();
  const [sent, setSent] = useState<string | null>(null);
  async function send(text: string) {
    try {
      await post(`/api/performances/${performanceId}/react-now`, { text });
      setSent(text);
      setTimeout(() => setSent(null), 1200);
      onSent();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }
  return (
    <div className="no-scrollbar mx-[18px] mt-2 flex items-center gap-2 overflow-x-auto">
      {QUICK.map((e) => (
        <button key={e} type="button" onClick={() => send(e)} aria-label={`React ${e}`} className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-[17px] transition active:scale-125', sent === e && 'bg-lime/30')}>
          {e}
        </button>
      ))}
      {LINES.map((l) => (
        <button key={l} type="button" onClick={() => send(l)} className={cx('h-9 shrink-0 rounded-full bg-white/10 px-3.5 font-ui text-[12px] font-semibold text-white/85', sent === l && 'bg-lime/30')}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** AUX IN at this venue: listen to the speakers in your earphones. */
export function AuxInCard({ venueId }: { venueId: string }) {
  const toast = useToast();
  const aux = useAuxIn();
  const { refresh } = useSession();
  const { data, reload } = useApi<AuxInfo>(`/api/auxin/venues/${venueId}`, { refreshMs: 20_000 });
  const [sheet, setSheet] = useState(false);
  const [code, setCode] = useState('');
  const [topUp, setTopUp] = useState(0);
  const [busy, setBusy] = useState(false);
  if (!data?.enabled) return null;
  const listening = aux.venueId === venueId && aux.status !== 'idle';

  async function listen() {
    if (!data) return;
    try {
      await aux.listen(data);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function buy(kind: 'DAY' | 'MONTH' | 'MEMBER') {
    setBusy(true);
    try {
      await post(`/api/auxin/venues/${venueId}/passes`, { kind, code: kind === 'MEMBER' ? code : undefined });
      await refresh();
      reload();
      setSheet(false);
      toast(kind === 'MEMBER' ? 'Member perk unlocked — listen in any time.' : 'Pass active. Tap Listen in.', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_FUNDS') setTopUp(kind === 'DAY' ? data!.dayPassCents : data!.monthPassCents);
      else toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mx-[18px] mt-3 flex items-center gap-3 rounded-[18px] border border-white/10 bg-black/35 px-3.5 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-[18px]">🎧</span>
        <span className="min-w-0 flex-1">
          <span className="block font-din text-[10px] font-bold uppercase tracking-[0.16em] text-lime">AUX IN</span>
          <span className="block truncate font-ui text-[13px] text-white/85">
            {!data.stream ? 'The speaker feed is offline right now' : data.pass ? `Hear the ${data.stream.zone.toLowerCase()} in your earphones` : `Hear the speakers in your earphones · Day Pass ${rand(data.dayPassCents / 100)}`}
          </span>
        </span>
        {listening ? (
          <button type="button" onClick={aux.stop} className="shrink-0 rounded-full bg-white/15 px-3.5 py-2 font-din text-[11px] font-bold uppercase tracking-wider text-white">
            Stop
          </button>
        ) : data.pass ? (
          <button type="button" disabled={!data.stream} onClick={listen} className="shrink-0 rounded-full bg-lime px-3.5 py-2 font-din text-[11px] font-bold uppercase tracking-wider text-lime-ink disabled:opacity-40">
            Listen in
          </button>
        ) : (
          <button type="button" onClick={() => setSheet(true)} className="shrink-0 rounded-full bg-lime px-3.5 py-2 font-din text-[11px] font-bold uppercase tracking-wider text-lime-ink">
            Get access
          </button>
        )}
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="AUX IN">
        <p className="mb-4 text-center font-ui text-[13px] leading-relaxed text-white/70">
          Hear exactly what&apos;s on {data.venueName}&apos;s speakers in your own earphones. Earphones die? You still have the speakers — and you can keep requesting.
        </p>
        <div className="flex flex-col gap-2">
          <PassOption title="Day Pass" sub={`${data.venueName} · today`} price={rand(data.dayPassCents / 100)} onClick={() => buy('DAY')} disabled={busy} />
          <PassOption title="AUX Pass" sub="30 days · every AUX IN venue" price={rand(data.monthPassCents / 100)} onClick={() => buy('MONTH')} disabled={busy} />
          {data.memberPerk && (
            <div className="rounded-2xl bg-white/[0.06] p-3">
              <p className="font-ui text-[14px] font-semibold text-white">Member? Listen free</p>
              <div className="mt-2 flex gap-2">
                <input className="field py-2.5" placeholder="Member code" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Member code" />
                <button type="button" disabled={!code || busy} onClick={() => buy('MEMBER')} className="shrink-0 rounded-full bg-lime px-4 font-din text-[12px] font-bold uppercase text-lime-ink disabled:opacity-50">
                  Unlock
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="mt-3 text-center font-ui text-[11px] text-white/45">Passes are paid from your token wallet. Listening works on site only.</p>
      </Sheet>
      <TopUpSheet open={topUp > 0} onClose={() => setTopUp(0)} needCents={topUp} />
    </>
  );
}

function PassOption({ title, sub, price, onClick, disabled }: { title: string; sub: string; price: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="flex items-center justify-between rounded-2xl bg-white/[0.07] px-4 py-3.5 text-left disabled:opacity-50">
      <span>
        <span className="block font-din text-[15px] font-bold uppercase tracking-wide text-white">{title}</span>
        <span className="block font-ui text-[12px] text-white/60">{sub}</span>
      </span>
      <span className="rounded-full bg-lime px-3 py-1.5 font-din text-[12px] font-bold text-lime-ink">{price}</span>
    </button>
  );
}

interface Connections {
  available: { spotify: boolean; appleMusic: boolean; youtube: boolean };
  connections: { provider: 'SPOTIFY' | 'APPLE_MUSIC'; displayName: string | null }[];
}

/** Where approved requests go: off (play them yourself), Spotify, or an AUXED Player screen. */
export function AutoQueueSheet({ room, open, onClose, onChanged }: { room: RoomDTO; open: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { data } = useApi<Connections>(open ? '/api/music/connections' : null);
  const current = room.playback?.provider ?? null;
  const spotify = data?.connections.find((c) => c.provider === 'SPOTIFY');
  const venueSet = !room.session;

  async function choose(provider: PlaybackTarget['provider'] | null) {
    try {
      await put(`/api/performances/${room.performance.id}/playback`, { provider });
      toast(provider ? 'Auto-queue is on.' : 'Auto-queue is off — play requests yourself.', 'success');
      onChanged();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  const Opt = ({ id, title, sub, children }: { id: PlaybackTarget['provider'] | null; title: string; sub: string; children?: React.ReactNode }) => (
    <div className={cx('rounded-2xl p-3.5', current === id ? 'bg-lime/15 ring-1 ring-lime' : 'bg-white/[0.06]')}>
      <button type="button" onClick={() => choose(id)} className="w-full text-left">
        <span className="flex items-center justify-between">
          <span className="font-ui text-[15px] font-semibold text-white">{title}</span>
          {current === id && <span className="font-din text-[10px] font-bold uppercase text-lime">On</span>}
        </span>
        <span className="mt-0.5 block font-ui text-[12px] text-white/60">{sub}</span>
      </button>
      {children}
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Auto-queue requests">
      <div className="flex flex-col gap-2 pb-2">
        <Opt id={null} title="Off" sub="You (or the DJ) play approved requests manually." />
        <Opt id="SPOTIFY" title={`Spotify${spotify ? ` · ${spotify.displayName}` : ''}`} sub="Approved requests are added to the queue on whatever device Spotify is playing on. Needs Spotify Premium.">
          {!spotify && (
            <a
              href={`/api/music/connect/spotify?return=${encodeURIComponent(`/sets/${room.performance.id}`)}`}
              className={cx('mt-2 inline-block rounded-full px-3.5 py-1.5 font-din text-[11px] font-bold uppercase', data?.available.spotify ? 'bg-[#1db954] text-black' : 'pointer-events-none bg-white/10 text-white/40')}
            >
              {data?.available.spotify ? 'Connect Spotify' : 'Spotify not set up on this server'}
            </a>
          )}
        </Opt>
        <Opt id="APPLE_MUSIC" title="Apple Music · AUXED Player" sub="Open the AUXED Player on the device connected to the speakers and sign in to Apple Music. It plays the queue by itself.">
          {current === 'APPLE_MUSIC' && <PlayerLink id={room.performance.id} seen={room.playback?.playerSeenAt} />}
        </Opt>
        <Opt id="YOUTUBE" title="YouTube · AUXED Player" sub="The AUXED Player finds each song on YouTube and plays it next. Best on a TV or tablet (the video stays on screen).">
          {current === 'YOUTUBE' && <PlayerLink id={room.performance.id} seen={room.playback?.playerSeenAt} />}
        </Opt>
        {room.playback?.lastError && <p className="rounded-2xl border border-amber-300/25 bg-amber-900/30 px-4 py-2.5 font-ui text-[12px] text-amber-50">{room.playback.lastError}</p>}
        {venueSet && (
          <p className="px-1 font-ui text-[11px] leading-relaxed text-white/45">
            Personal Spotify, Apple Music and YouTube accounts are licensed for personal use only. Playing them in a business needs a business music service and SAMRO/SAMPRA licences.
          </p>
        )}
      </div>
    </Sheet>
  );
}

function PlayerLink({ id, seen }: { id: string; seen?: string | null }) {
  const online = seen && Date.now() - new Date(seen).getTime() < 60_000;
  return (
    <div className="mt-2 flex items-center gap-2">
      <Link href={`/player/${id}`} className="rounded-full bg-lime px-3.5 py-1.5 font-din text-[11px] font-bold uppercase text-lime-ink">
        Open AUXED Player
      </Link>
      <span className={cx('font-ui text-[11px]', online ? 'text-lime' : 'text-white/50')}>{online ? '● Player online' : 'Player not open'}</span>
    </div>
  );
}
