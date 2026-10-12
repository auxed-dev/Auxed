/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { api, post, ApiError, errorMessage } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import { duration, rand } from '@/lib/format';
import { exceedsMaxLength, micPriceCents, requestPriceCents, songPriceCents } from '@/lib/pricing';
import { cx } from '@/lib/util';
import type { RoomDTO, Suggestion, Track } from '@/lib/types';
import { previewKey, stopPreview, togglePreview, usePreview } from '@/lib/client/preview';
import { useApi } from '@/lib/client/useApi';
import { Sheet, TabPills } from './ui';
import { IconNote, IconPause, IconPlay, IconSearch, IconUp } from './Icons';
import { TopUpSheet } from './TopUpSheet';
import { useToast } from './Toast';

type Mode = 'Song' | 'On The Mic';

/** Search a song (or write an On The Mic shout-out), see the price, pay from the token wallet. */
export function RequestSheet({
  room,
  open,
  onClose,
  onDone,
  initialMode = 'Song',
}: {
  room: RoomDTO;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  initialMode?: Mode;
}) {
  const { user, refresh } = useSession();
  const toast = useToast();
  const c = room.controls;
  const free = !!room.session;
  const modes: Mode[] = c.mic === 'NO' ? ['Song'] : ['Song', 'On The Mic'];
  const [mode, setMode] = useState<Mode>(initialMode);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Track | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [topUp, setTopUp] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const { data: picks } = useApi<{ picks: Suggestion[] }>(open ? `/api/performances/${room.performance.id}/suggestions` : null);
  useEffect(() => {
    if (!open) stopPreview();
    return () => stopPreview();
  }, [open]);

  useEffect(() => {
    if (open) {
      setMode(c.mic === 'NO' ? 'Song' : initialMode);
      setError(null);
      setDuplicateId(null);
    }
  }, [open, initialMode, c.mic]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      setSearching(true);
      try {
        const r = await api<{ tracks: Track[] }>(`/api/music/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        setResults(r.tracks);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError(errorMessage(err));
      } finally {
        if (abort.current === ctl) setSearching(false);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [q]);

  const kind = mode === 'Song' ? 'SONG' : 'MIC';
  const price = free ? 0 : kind === 'SONG' ? (picked ? songPriceCents(picked, c) : 0) : requestPriceCents('MIC', picked, c);
  const wallet = user?.walletCents ?? 0;
  const short = price > wallet;
  const ready = kind === 'SONG' ? !!picked : message.trim().length > 0;

  async function submit() {
    if (!ready) return;
    if (short) {
      setTopUp(true);
      return;
    }
    setBusy(true);
    setError(null);
    setDuplicateId(null);
    try {
      const made = await post<{ id: string; priceCents: number }>(`/api/performances/${room.performance.id}/requests`, {
        kind,
        track: kind === 'SONG' || c.mic === 'YES_PLUS' ? picked : null,
        message: kind === 'MIC' ? message.trim() : undefined,
      });
      await refresh();
      // Night-out guardrail: 30 seconds to change your mind (full refund).
      toast(free ? 'Added to the queue 🎶' : kind === 'SONG' ? 'Request sent! Watch it climb the queue.' : 'Your message is in. Listen out for it!', 'success', {
        ms: 30_000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await post(`/api/requests/${made.id}/cancel`);
              await refresh();
              onDone();
              toast(made.priceCents > 0 ? 'Undone — tokens are back in your wallet.' : 'Removed from the queue.', 'success');
            } catch (e) {
              toast(errorMessage(e), 'error');
            }
          },
        },
      });
      setPicked(null);
      setQ('');
      setMessage('');
      onDone();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code?.startsWith('DUPLICATE:')) setDuplicateId(err.code.slice('DUPLICATE:'.length));
      else if (err instanceof ApiError && err.code === 'INSUFFICIENT_FUNDS') setTopUp(true);
      else if (err instanceof ApiError && err.code === 'SPEND_CAP') setPicked(null);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function upvote(id: string) {
    try {
      await post(`/api/requests/${id}/vote`, { value: 1 });
      toast('Upvoted! It moves up the queue.', 'success');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function upvoteDuplicate() {
    if (!duplicateId) return;
    try {
      await post(`/api/requests/${duplicateId}/vote`, { value: 1 });
      toast('Upvoted! It moves up the queue.', 'success');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <Sheet open={open && !topUp} onClose={onClose} title={free ? 'Add to the queue' : kind === 'SONG' ? 'Make a request' : 'On The Mic'}>
        {!room.canRequest.ok && <p className="mb-3 rounded-2xl bg-white/10 px-4 py-3 text-center font-ui text-[13px] text-white/80">{room.canRequest.reason}</p>}
        {modes.length > 1 && <TabPills tabs={modes} value={mode} onChange={setMode} className="mb-3 justify-center" />}

        <div className={cx('mb-3 flex flex-wrap justify-center gap-x-4 gap-y-1 font-ui text-[11.5px] text-white/60', free && 'hidden')}>
          <span>
            {rand(c.ratePerMinShort)}/min up to 5 min · {rand(c.ratePerMinLong)}/min longer
          </span>
          <span>Max {c.maxSongLength} min</span>
          {c.mic !== 'NO' && <span>On The Mic {rand(c.micPrice)}</span>}
        </div>

        {kind === 'MIC' && (
          <div className="mb-4">
            <label htmlFor="mic-msg" className="label">
              Your message (read out by {room.performance.performer.name})
            </label>
            <textarea
              id="mic-msg"
              className="field-area min-h-[92px]"
              maxLength={200}
              placeholder="“Happy Birthday! James, we love you.”"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="mt-1 pr-2 text-right font-ui text-[11px] text-white/45">{message.length}/200</p>
            {c.mic === 'YES_PLUS' && <p className="font-ui text-[12px] text-white/60">Optional: add a song to play with your shout-out.</p>}
          </div>
        )}

        {(kind === 'SONG' || c.mic === 'YES_PLUS') && (
          <>
            <div className="relative mb-3">
              <IconSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50" />
              <input
                className="field pl-11"
                placeholder="Search songs, artists or paste a link"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search songs"
                autoFocus={kind === 'SONG'}
              />
            </div>
            {picked && (
              <TrackRow track={picked} price={free ? 0 : songPriceCents(picked, c)} free={free} selected onClick={() => setPicked(null)} />
            )}
            <div className="flex max-h-[38dvh] flex-col gap-2 overflow-y-auto pb-1">
              {q.trim().length < 2 && !picked && (picks?.picks.length ?? 0) > 0 && (
                <>
                  <p className="px-1 font-din text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/55">Quick picks for you</p>
                  {picks!.picks.map((s) => (
                    <TrackRow
                      key={`pick-${s.track.title}-${s.track.artist}`}
                      track={s.track}
                      price={s.priceCents}
                      free={free || !!s.requestId}
                      note={s.reason}
                      noteTone="info"
                      cta={s.requestId ? 'Upvote' : undefined}
                      onClick={() => (s.requestId ? upvote(s.requestId) : setPicked(s.track))}
                    />
                  ))}
                </>
              )}
              {searching && <p className="py-3 text-center font-ui text-[13px] text-white/50">Searching…</p>}
              {!searching && q.trim().length >= 2 && results.length === 0 && <p className="py-3 text-center font-ui text-[13px] text-white/50">No songs found.</p>}
              {results
                .filter((t) => !picked || t.externalId !== picked.externalId)
                .map((t) => {
                  const tooLong = exceedsMaxLength(t, c);
                  return (
                    <TrackRow
                      key={`${t.source}-${t.externalId ?? t.title}`}
                      track={t}
                      price={free ? 0 : songPriceCents(t, c)}
                      free={free}
                      disabled={tooLong}
                      note={tooLong ? `Over ${c.maxSongLength} min` : undefined}
                      onClick={() => !tooLong && setPicked(t)}
                    />
                  );
                })}
            </div>
          </>
        )}

        {error && (
          <div role="alert" className="mt-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-center font-ui text-[13px] text-white/90">
            {error}
            {duplicateId && (
              <button type="button" onClick={upvoteDuplicate} className="mx-auto mt-3 flex items-center gap-2 rounded-full bg-lime px-5 py-2 font-din text-[13px] font-bold uppercase text-lime-ink">
                <IconUp size={14} /> Upvote it instead
              </button>
            )}
          </div>
        )}

        {picked && !free && (
          <p className="mt-4 rounded-2xl bg-black/30 px-4 py-2.5 text-center font-ui text-[12px] text-white/75">
            {duration(picked.durationSec)} × {rand(picked.durationSec <= 300 ? c.ratePerMinShort : c.ratePerMinLong)}/min ={' '}
            <b className="text-white">{tokens(songPriceCents(picked, c))} tokens</b>
            {kind === 'MIC' && <> + On The Mic {tokens(micPriceCents(c))} tokens</>}
          </p>
        )}
        <div className={cx('mt-4 flex items-center justify-between px-1 font-ui text-[13px] text-white/70', free && 'hidden')}>
          <span>Wallet {rand(wallet / 100)}</span>
          <span>
            {kind === 'MIC' && <>On The Mic {rand(micPriceCents(c) / 100)} </>}
            Total <span className="font-semibold text-white">{rand(price / 100)}</span>
          </span>
        </div>
        {free || short || !ready ? (
          <button type="button" onClick={submit} disabled={!ready || busy || !room.canRequest.ok} className="glass-pill mt-3 h-[60px] w-full text-[15px] disabled:opacity-50">
            {busy ? 'Sending…' : free ? 'Add to the queue' : short && ready ? `Top up to request` : `Request for ${rand(price / 100)}`}
          </button>
        ) : (
          <HoldButton disabled={busy || !room.canRequest.ok} onConfirm={submit} label={busy ? 'Sending…' : `Hold to request · ${rand(price / 100)}`} />
        )}
        {!free && ready && !short && <p className="mt-2 text-center font-ui text-[11px] text-white/45">Press and hold to confirm. You can undo for 30 seconds.</p>}
      </Sheet>
      <TopUpSheet open={topUp} onClose={() => setTopUp(false)} needCents={Math.max(0, price - wallet)} />
    </>
  );
}

/** In-app tokens: 1 token = R1, so a price in cents is cents / 100 tokens. */
function tokens(cents: number) {
  const t = cents / 100;
  return Number.isInteger(t) ? String(t) : t.toFixed(2);
}

/** Paid requests need a deliberate press-and-hold (no accidental taps on a night out). */
function HoldButton({ onConfirm, disabled, label }: { onConfirm: () => void; disabled?: boolean; label: string }) {
  const [p, setP] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const HOLD = 800;
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setP(0);
  };
  const start = () => {
    if (disabled || timer.current) return;
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const v = (Date.now() - t0) / HOLD;
      if (v >= 1) {
        stop();
        if (navigator.vibrate) navigator.vibrate(30);
        onConfirm();
      } else setP(v);
    }, 16);
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onConfirm())}
      onContextMenu={(e) => e.preventDefault()}
      className="glass-pill relative mt-3 h-[60px] w-full touch-none select-none overflow-hidden text-[15px] disabled:opacity-50"
    >
      <span className="absolute inset-y-0 left-0 bg-lime/35" style={{ width: `${p * 100}%` }} />
      <span className="relative">{label}</span>
    </button>
  );
}

function TrackRow({
  track,
  price,
  onClick,
  selected,
  disabled,
  note,
  noteTone = 'warn',
  free,
  cta,
}: {
  track: Track;
  price: number;
  onClick: () => void;
  selected?: boolean;
  disabled?: boolean;
  note?: string;
  noteTone?: 'warn' | 'info';
  free?: boolean;
  cta?: string;
}) {
  return (
    <div
      className={cx(
        'flex w-full items-center gap-3 rounded-2xl p-2 pr-3 text-left transition',
        selected ? 'bg-lime/15 ring-2 ring-lime' : 'bg-white/[0.06] hover:bg-white/10',
        disabled && 'opacity-45',
      )}
    >
      <PreviewCover track={track} />
      <button type="button" onClick={onClick} disabled={disabled} className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-din text-[14px] font-bold uppercase tracking-wide text-white">{track.title}</span>
        <span className="block truncate font-ui text-[12.5px] text-white/65">
          {track.artist} · {duration(track.durationSec)}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {cta ? (
          <span className="block rounded-full bg-lime px-2.5 py-1 font-din text-[10px] font-bold uppercase text-lime-ink">{cta}</span>
        ) : (
          !free && <span className="block font-num text-[14px] font-light text-white">{rand(price / 100)}</span>
        )}
        {note && <span className={cx('block max-w-[120px] truncate font-ui text-[10px]', noteTone === 'info' ? 'text-lime/80' : 'text-red-200')}>{note}</span>}
        {selected && <span className="block font-din text-[10px] font-bold uppercase text-lime">Selected</span>}
      </span>
      </button>
    </div>
  );
}

/** The cover doubles as a 30-second preview button, so people can check it's the right song. */
function PreviewCover({ track }: { track: Track }) {
  const p = usePreview();
  const toast = useToast();
  const on = p.key === previewKey(track);
  return (
    <button
      type="button"
      onClick={() => togglePreview(track).catch((err) => toast(errorMessage(err), 'error'))}
      aria-label={on ? `Stop preview of ${track.title}` : `Preview ${track.title}`}
      className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl"
    >
      {track.artwork ? (
        <img src={track.artwork.replace('600x600', '120x120')} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-black/50 text-white/60">
          <IconNote size={20} />
        </span>
      )}
      <span className={cx('absolute inset-0 flex items-center justify-center transition', on ? 'bg-black/55' : 'bg-black/0')}>
        {on && !p.loading && (
          <span className="absolute inset-[5px] rounded-full" style={{ background: `conic-gradient(#d0ff34 ${p.progress * 360}deg, rgba(255,255,255,0.18) 0)`, mask: 'radial-gradient(circle, transparent 62%, #000 64%)', WebkitMask: 'radial-gradient(circle, transparent 62%, #000 64%)' }} />
        )}
        <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-white', on ? '' : 'absolute bottom-1 right-1 h-5 w-5 bg-black/60')}>
          {on ? p.loading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <IconPause size={12} /> : <IconPlay size={10} className="translate-x-[1px]" />}
        </span>
      </span>
    </button>
  );
}
