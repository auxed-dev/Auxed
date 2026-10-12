/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react';
import { duration } from '@/lib/format';
import { cx } from '@/lib/util';
import { IconCaretDown, IconNote, IconPlus } from './Icons';

/** Set Box / Trinkets panel shell: themed rounded panel with the set picker header. */
export function TrackPanel({
  title,
  date,
  filters,
  onPickSet,
  onAddFilters,
  children,
}: {
  title: string;
  date: string;
  filters: number;
  onPickSet?: () => void;
  onAddFilters?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="glow-card mx-[6px] min-h-[80dvh] rounded-b-none rounded-t-[36px] px-[26px] pb-10 pt-[24px]">
      <div className="mb-3 flex items-start justify-between px-[4px]">
        <button type="button" onClick={onPickSet} className="min-w-0 text-left">
          <span className="flex items-center gap-1 font-din text-[16px] font-bold uppercase tracking-[0.06em] text-white/85">
            <span className="truncate">{title}</span>
            <IconCaretDown size={15} className="shrink-0" />
          </span>
          <span className="flex gap-10 font-din text-[6.5px] font-bold uppercase tracking-[0.12em] text-white/70">
            <span>Date on Aux: {date}</span>
            <span>{filters ? `${filters}+ filters` : 'No filters'}</span>
          </span>
        </button>
        {onAddFilters && (
          <button type="button" onClick={onAddFilters} className="flex shrink-0 items-center gap-2 font-din text-[16px] font-bold uppercase tracking-[0.06em] text-white/80">
            <span className="flex h-[21px] w-[21px] items-center justify-center rounded-[4px] bg-black/55">
              <IconPlus size={13} />
            </span>
            Add Filters
          </button>
        )}
      </div>
      <div className="flex flex-col gap-[14px]">{children}</div>
    </section>
  );
}

export function TrackRow({
  title,
  artist,
  album,
  sec,
  artwork,
  badge,
  actions,
  tone = 'green',
}: {
  title: string;
  artist: string;
  album?: string;
  sec?: number;
  artwork?: string | null;
  badge?: ReactNode;
  actions?: ReactNode;
  tone?: 'green' | 'olive';
}) {
  return (
    <div
      className="relative flex h-[106px] items-stretch gap-3 rounded-[16px] py-3 pl-4 pr-3"
      style={
        tone === 'olive'
          ? { background: 'linear-gradient(180deg, rgba(150,148,50,0.92), rgba(120,118,38,0.92))', boxShadow: '0 10px 22px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)' }
          : { background: 'linear-gradient(180deg, rgba(28,36,33,0.95), rgba(20,26,24,0.95))', boxShadow: '0 10px 22px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)' }
      }
    >
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <p className="truncate font-din text-[13px] text-white">
          <b className="font-bold uppercase tracking-[0.06em]">{title}</b> <span className="font-normal tracking-wide text-white/90">• {artist}</span>
        </p>
        <div className="flex items-end justify-between gap-2">
          <p className="min-w-0 truncate font-din text-[13px] uppercase tracking-[0.06em] text-white/90">{album ?? ''}</p>
          {sec !== undefined && <span className="shrink-0 font-din text-[13px] text-white">{duration(sec)}</span>}
        </div>
        {badge && <div className="absolute left-4 top-[44px]">{badge}</div>}
      </div>
      <div className="relative h-[78px] w-[78px] shrink-0 self-center overflow-hidden rounded-[6px] bg-black">
        {artwork ? (
          <img src={artwork.replace('600x600', '200x200')} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-white/70">
            <svg width="44" height="30" viewBox="0 0 44 30" aria-hidden>
              <path d="M2 15h8l3-9 4 18 4-24 4 28 4-20 3 10 3-6h7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </span>
        )}
      </div>
      {actions && <div className="absolute -right-2 -top-2 flex gap-1">{actions}</div>}
    </div>
  );
}

export function SlotRow({ label = 'Song Request Slot', onClick, className }: { label?: string; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('flex h-[106px] items-center justify-center gap-4 rounded-[16px]', className)}
      style={{ background: 'linear-gradient(180deg, rgba(28,36,33,0.95), rgba(20,26,24,0.95))', boxShadow: '0 10px 22px rgba(0,0,0,0.45)' }}
    >
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-black/60 text-accent-soft">
        <IconNote size={17} />
      </span>
      <span className="font-din text-[17px] font-bold uppercase tracking-[0.1em] text-white/80">{label}</span>
    </button>
  );
}
