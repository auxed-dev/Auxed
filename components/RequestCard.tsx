/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import { compact, duration, rand } from '@/lib/format';
import { REACTIONS } from '@/lib/reactions';
import { cx } from '@/lib/util';
import type { RequestDTO } from '@/lib/types';
import { IconCheck, IconDown, IconNote, IconPlay, IconUp, IconX } from './Icons';

export interface RequestActions {
  onVote?: (r: RequestDTO, value: 1 | -1) => void;
  onReact?: (r: RequestDTO, emoji: string) => void;
  onDecide?: (r: RequestDTO, action: 'approve' | 'reject' | 'play') => void;
}

/** One request in a set's queue: song (or On The Mic message), price, votes and reactions. */
const TONES = {
  blue: { base: 'rgba(36, 42, 104, 0.62)', veil: 'linear-gradient(180deg, rgba(8,12,44,0.42) 0%, rgba(8,12,44,0.12) 42%, rgba(8,12,44,0.5) 100%)' },
  green: { base: 'rgba(8, 18, 15, 0.9)', veil: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.55) 100%)' },
  purple: { base: 'rgba(40, 14, 70, 0.7)', veil: 'linear-gradient(180deg, rgba(14,4,26,0.4) 0%, rgba(14,4,26,0.12) 45%, rgba(14,4,26,0.55) 100%)' },
} as const;

export function RequestCard({
  r,
  manage,
  fallbackImage,
  compactLayout,
  tone = 'blue',
  onMenu,
  ...actions
}: { r: RequestDTO; manage?: boolean; fallbackImage?: string | null; compactLayout?: boolean; tone?: keyof typeof TONES; onMenu?: () => void } & RequestActions) {
  const [picker, setPicker] = useState(false);
  const isMic = r.kind === 'MIC';
  // AUXees see each song's artwork; artists see their club photo behind every card (as designed).
  const bg = tone === 'green' ? fallbackImage ?? r.track?.artwork ?? null : r.track?.artwork ?? fallbackImage ?? null;
  const t = TONES[tone];
  const title = isMic ? `“${r.message ?? ''}”` : r.track?.title ?? 'Request';
  const sub = isMic ? 'On The Mic' : r.track?.artist ?? '';
  const reactions = [...r.reactions].sort((a, b) => b.count - a.count).slice(0, 4);
  const playing = r.status === 'PLAYING';
  const done = r.status === 'PLAYED' || r.status === 'REJECTED';
  const onVote = done ? undefined : actions.onVote;

  return (
    <article
      className={cx(
        'relative overflow-hidden rounded-[20px] shadow-[0_14px_28px_-14px_rgba(0,0,0,0.85)]',
        compactLayout ? 'h-[86px]' : 'h-[132px]',
        playing && 'ring-2 ring-lime/80 shadow-[0_0_26px_rgba(201,241,59,0.35)]',
        done && 'opacity-70',
      )}
    >
      <div className="absolute inset-0" style={{ background: t.base }} />
      {bg && (
        <img
          src={bg}
          alt=""
          className={cx('absolute inset-0 h-full w-full object-cover', tone === 'green' ? 'opacity-70' : 'opacity-55')}
          style={tone === 'green' ? undefined : { WebkitMaskImage: 'linear-gradient(90deg, transparent 4%, #000 34%, #000 72%, transparent 100%)', maskImage: 'linear-gradient(90deg, transparent 4%, #000 34%, #000 72%, transparent 100%)' }}
          loading="lazy"
        />
      )}
      <div className="absolute inset-0" style={{ background: t.veil }} />
      <div className={cx('relative flex h-full flex-col justify-between px-[22px]', compactLayout ? 'py-3' : 'py-[16px]')}>
        <div className="flex items-start justify-between gap-3">
          <h3 className={cx('min-w-0 flex-1 truncate font-din font-bold uppercase tracking-[0.06em] text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]', isMic ? 'normal-case text-[15px] italic' : 'text-[15px]')}>
            {onMenu ? (
              <button type="button" onClick={onMenu} className="max-w-full truncate text-left [letter-spacing:inherit] [text-transform:inherit]" aria-label={`${title} — save or share`}>
                {title}
              </button>
            ) : (
              title
            )}
          </h3>
          <span className="shrink-0 font-din text-[15px] font-bold text-white">
            {playing ? <span className="rounded-full bg-lime px-2 py-0.5 text-[10px] uppercase tracking-wider text-lime-ink">Now Playing</span> : r.track ? duration(r.track.durationSec) : ''}
          </span>
        </div>
        <div>
          <div className="flex items-end justify-between gap-3">
            <p className="min-w-0 flex-1 truncate font-din text-[15px] font-bold uppercase tracking-[0.08em] text-white">{sub}</p>
            <p className="shrink-0 font-num text-[16px] font-light text-white/90">{rand(r.priceCents / 100)}</p>
          </div>
          {!compactLayout && (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  aria-label="Upvote"
                  aria-pressed={r.myVote === 1}
                  disabled={!onVote}
                  onClick={() => onVote?.(r, 1)}
                  className={cx('flex items-center gap-1 font-din text-[11px] font-bold transition active:scale-90', r.myVote === 1 ? 'text-lime' : 'text-white')}
                >
                  <IconUp size={17} /> {compact(r.up, true)}
                </button>
                <button
                  type="button"
                  aria-label="Downvote"
                  aria-pressed={r.myVote === -1}
                  disabled={!onVote}
                  onClick={() => onVote?.(r, -1)}
                  className={cx('flex items-center gap-1 font-din text-[11px] font-bold transition active:scale-90', r.myVote === -1 ? 'text-red-300' : 'text-white')}
                >
                  <IconDown size={17} /> {compact(r.down, true)}
                </button>
                {r.status === 'PLAYED' && <span className="rounded-full bg-white/15 px-2 py-0.5 font-din text-[9px] font-bold uppercase tracking-wider text-white/80">Played</span>}
                {r.status === 'PENDING' && !manage && <span className="rounded-full bg-white/15 px-2 py-0.5 font-din text-[9px] font-bold uppercase tracking-wider text-white/80">Awaiting artist</span>}
              </div>
              <button
                type="button"
                onClick={() => actions.onReact && setPicker((p) => !p)}
                className="flex items-center gap-2 font-din text-[14px] font-bold text-white"
                aria-label="React"
              >
                {reactions.length ? (
                  reactions.map((x) => (
                    <span key={x.emoji} className={cx('flex items-center', x.mine && 'drop-shadow-[0_0_6px_rgba(201,241,59,0.9)]')}>
                      {compact(x.count)}
                      <span className="text-[14px]">{x.emoji}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-[12px] font-semibold text-white/60">+ React</span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {manage && (r.status === 'PENDING' || r.status === 'QUEUED') && (
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 gap-2">
          {r.status === 'PENDING' && (
            <>
              <ManageBtn label="Decline (refund)" onClick={() => actions.onDecide?.(r, 'reject')} className="bg-red-500/85">
                <IconX size={16} />
              </ManageBtn>
              <ManageBtn label="Accept" onClick={() => actions.onDecide?.(r, 'approve')} className="bg-lime text-lime-ink">
                <IconCheck size={16} />
              </ManageBtn>
            </>
          )}
          <ManageBtn label="Play now" onClick={() => actions.onDecide?.(r, 'play')} className="bg-white text-black">
            <IconPlay size={15} />
          </ManageBtn>
        </div>
      )}

      {picker && actions.onReact && (
        <div className="absolute inset-x-3 bottom-3 z-10 flex animate-popIn justify-between rounded-full bg-black/85 px-3 py-2 backdrop-blur">
          {REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              className="text-[20px] transition active:scale-125"
              onClick={() => {
                actions.onReact?.(r, e);
                setPicker(false);
              }}
              aria-label={`React ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function ManageBtn({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cx('flex h-9 w-9 items-center justify-center rounded-full shadow-lg transition active:scale-90', className)}>
      {children}
    </button>
  );
}

/** "OPEN REQUEST SLOT" / "MAKE A REQUEST!" card. */
export function RequestSlot({ label, onClick, disabled, tone = 'blue' }: { label: string; onClick?: () => void; disabled?: boolean; tone?: 'blue' | 'green' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative flex h-[128px] w-full items-center justify-center gap-4 rounded-[22px] transition active:scale-[0.99] disabled:opacity-60"
      style={
        tone === 'blue'
          ? { background: 'linear-gradient(180deg, rgba(60,80,200,0.55), rgba(40,58,170,0.45))', boxShadow: 'inset 0 0 30px rgba(120,140,255,0.35), 0 0 30px rgba(50,70,200,0.25)' }
          : { background: 'linear-gradient(180deg, rgba(22,40,32,0.85), rgba(10,20,16,0.85))', boxShadow: 'inset 0 0 24px rgba(165,209,194,0.12)' }
      }
    >
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-black/70 text-[#8aa2ff]">
        <IconNote size={17} className={tone === 'green' ? 'text-accent-soft' : ''} />
      </span>
      <span className="font-din text-[17px] font-bold uppercase tracking-[0.1em] text-white/75">{label}</span>
    </button>
  );
}
