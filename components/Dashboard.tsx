/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { clock, dayPart, grouped, rand } from '@/lib/format';
import { cx } from '@/lib/util';
import type { PerformanceBrief, VenueDTO } from '@/lib/types';
import { IconChevronDown, IconChevronRight } from './Icons';

/**
 * The summary card at the top of the dashboards. Sizes are taken from the Figma frames:
 * 361 x 256 on a 377pt-wide screen (so it scales with the phone), 22px radius, diamond gradient.
 * Arrows on both sides (and swiping) move between summaries.
 */
export function SummaryCarousel({ index, count, onChange, children }: { index: number; count: number; onChange: (i: number) => void; children: ReactNode }) {
  const start = useRef<number | null>(null);
  return (
    <section
      className="glow-card mx-[8px] aspect-[361/256] max-h-[300px] w-[calc(100%-16px)]"
      onTouchStart={(e) => (start.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (start.current === null) return;
        const dx = e.changedTouches[0].clientX - start.current;
        start.current = null;
        if (Math.abs(dx) > 50) onChange((index + (dx < 0 ? 1 : -1) + count) % count);
      }}
    >
      <div key={index} className="h-full animate-fadeIn">
        {children}
      </div>
      <CardArrow side="left" onClick={() => onChange((index - 1 + count) % count)} />
      <CardArrow side="right" onClick={() => onChange((index + 1) % count)} />
    </section>
  );
}

function CardArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={side === 'left' ? 'Previous summary' : 'Next summary'}
      onClick={onClick}
      className={cx(
        'absolute top-1/2 z-10 flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center rounded-full bg-[#120d1c] text-accent-soft shadow-[0_0_8px_rgba(0,0,0,0.6)] transition active:scale-90',
        side === 'left' ? 'left-[8px]' : 'right-[12px]',
      )}
    >
      <IconChevronRight size={11} className={side === 'left' ? 'rotate-180' : ''} />
    </button>
  );
}

/** The white ring with "Request Revenue / Total Balance". */
export function RevenueCircle({ cents, bold, children }: { cents: number; bold?: boolean; children?: ReactNode }) {
  return (
    <div className="relative flex h-full items-center justify-center">
      {children}
      <div className="flex aspect-square h-[83%] flex-col items-center justify-center rounded-full border-[2.5px] border-white">
        <p className="font-din text-[12.5px] font-bold tracking-[0.07em] text-white">Request Revenue</p>
        <p className="mt-1 font-num text-[11.5px] font-light tracking-wide text-white">Total Balance:</p>
        <p className={cx('mt-4 font-num text-[24px] tracking-wide text-white', bold ? 'font-bold' : 'font-light')}>{rand(cents / 100)}</p>
      </div>
    </div>
  );
}

export function SummaryTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-center font-din text-[15px] font-bold tracking-[0.07em] text-white/90 [text-shadow:0_0_10px_rgba(255,255,255,0.25)]">{children}</h3>;
}

/**
 * Two-column label/value list ("Analytical Summary", "Financial Summary"...). Rows sit on a 22px
 * pitch under the title, as in the designs; `inset` is the [left, right] text inset in px.
 */
export function SummaryTable({
  title,
  rows,
  inset = [33, 44],
}: {
  title: string;
  rows: ({ label: ReactNode; value: ReactNode; bold?: boolean; red?: boolean; indent?: boolean } | 'gap')[];
  inset?: [number, number];
}) {
  return (
    <div className="flex h-full flex-col pt-[15px]" style={{ paddingLeft: inset[0], paddingRight: inset[1] }}>
      <SummaryTitle>{title}</SummaryTitle>
      <dl className="mt-[3px] flex flex-col">
        {rows.map((r, i) =>
          r === 'gap' ? (
            <div key={i} className="h-[22px]" />
          ) : (
            <div key={i} className="flex min-h-[22px] items-center justify-between gap-3">
              <dt className={cx('shrink-0 font-din text-[10px] font-bold tracking-[0.07em]', r.red ? 'text-[#ff4d4d]' : 'text-white', r.indent && 'pl-5 font-normal')}>{r.label}</dt>
              <dd className={cx('min-w-0 truncate text-right font-num text-[10px] tracking-wide text-white/90', r.bold ? 'font-bold' : 'font-light')}>{r.value ?? '—'}</dd>
            </div>
          ),
        )}
      </dl>
    </div>
  );
}

/** The swirl A, filled with the silver gradient used on the dashboard chart cards. */
export function BadgeA({ size = 94, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('block', className)}
      style={{
        width: size * 0.793,
        height: size,
        background: 'linear-gradient(180deg, #e6e6e6 0%, #bdbdbd 45%, #8e8e8e 100%)',
        WebkitMaskImage: 'url(/brand/auxed-a-256.png)',
        maskImage: 'url(/brand/auxed-a-256.png)',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.55))',
      }}
    />
  );
}

/**
 * Chart card exactly as designed (title, A badge, ALL VENUES ▾). Tap the card to open the live chart;
 * tap again to fold it back to the badge.
 */
export function ChartCard({
  title,
  children,
  venues,
  venueId,
  onVenue,
  id,
  defaultOpen,
}: {
  title: string;
  children: ReactNode;
  venues?: Pick<VenueDTO, 'id' | 'name'>[];
  venueId?: string;
  onVenue?: (id: string) => void;
  id?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section id={id} className={cx('chart-card transition-[min-height] duration-300', open ? 'min-h-[152px] pb-12' : 'h-[152px]')}>
      <button type="button" aria-expanded={open} aria-label={`${title}: ${open ? 'hide chart' : 'show chart'}`} onClick={() => setOpen((o) => !o)} className="absolute inset-0 z-0" />
      <h3
        className="pointer-events-none relative z-[1] max-w-[62%] px-[18px] pt-[14px] font-din text-[15px] font-bold uppercase leading-[1.55] tracking-[0.07em]"
        style={{ background: 'linear-gradient(180deg,#d6d6d6,#9d9d9d)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
      >
        {title}
      </h3>
      {open ? (
        <div className="relative z-[1] px-[18px] pt-2">
          {children}
          <BadgeA size={26} className="pointer-events-none absolute -top-9 right-[18px] opacity-70" />
        </div>
      ) : (
        <div className="pointer-events-none absolute left-1/2 top-[23px] z-[1] -translate-x-1/2">
          <BadgeA size={100} />
        </div>
      )}
      {venues && onVenue && (
        <label className="absolute bottom-[14px] right-[18px] z-[2] flex items-center gap-1 font-din text-[15px] font-bold uppercase tracking-[0.06em] text-white/85">
          <select value={venueId ?? ''} onChange={(e) => onVenue(e.target.value)} className="max-w-[170px] appearance-none truncate bg-transparent text-right uppercase outline-none" aria-label={`${title} venue filter`}>
            <option value="" className="bg-black">
              All Venues
            </option>
            {venues.map((v) => (
              <option key={v.id} value={v.id} className="bg-black">
                {v.name}
              </option>
            ))}
          </select>
          <IconChevronDown size={12} className="pointer-events-none" />
        </label>
      )}
    </section>
  );
}

/** "Upcoming Event Friday Evening" booking card (DJ design 264 x 146, owner design 280 x 156). */
export function BookingCard({ p, variant = 'artist', wide }: { p: PerformanceBrief; variant?: 'artist' | 'owner'; wide?: boolean }) {
  const live = p.status === 'LIVE';
  const owner = variant === 'owner';
  return (
    <Link
      href={`/sets/${p.id}`}
      className={cx(
        'relative block shrink-0 snap-start overflow-hidden rounded-[16px] bg-[#1a0606] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.9)]',
        owner ? 'h-[156px]' : 'h-[146px]',
        wide ? 'w-full' : owner ? 'w-[280px]' : 'w-[264px]',
      )}
    >
      {(p.imageUrl ?? p.venue.imageUrl) && <img src={(p.imageUrl ?? p.venue.imageUrl)!} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/25 to-black/75" />
      {/* Later events sit back behind the venue carousel, as in the owner design. */}
      {owner && wide && <div className="absolute inset-0 bg-black/[0.62]" />}
      <div className={cx('absolute top-[12px] flex items-center justify-between', owner ? 'inset-x-[10px]' : 'inset-x-[14px]')}>
        <p className={cx('truncate font-din tracking-[0.04em] text-white', owner ? 'text-[12.5px]' : 'text-[11px]')}>
          <b className="font-bold">{live ? 'Live Now' : variant === 'owner' || wide ? 'Upcoming Event:' : 'Upcoming Event'}</b> {live ? p.title : wide ? p.title : dayPart(p.startsAt)}
        </p>
        {live && <span className="h-2 w-2 shrink-0 animate-pulseGlow rounded-full bg-red-500" />}
      </div>
      <div className={cx('absolute font-din leading-[1.45] tracking-[0.05em] text-white', owner ? 'bottom-[18px] left-[10px] text-[10.5px]' : 'bottom-[12px] left-[14px] text-[9.5px]')}>
        {!owner && (
          <p>
            <b>Performance Time</b> {clock(p.startsAt)} - {clock(p.endsAt)}
          </p>
        )}
        <p>
          <b>{variant === 'artist' ? 'Crowd Size Est.' : 'Traffic Est.'}</b> {grouped(p.crowdEstimate)}
        </p>
        <p className="mt-0.5">
          <b>Request No.</b> {p.requestCount}
        </p>
      </div>
      <p
        className={cx(
          'absolute max-w-[52%] truncate font-din font-bold uppercase tracking-[0.07em]',
          owner ? 'bottom-[17px] right-[16px] text-[14.5px] text-white/85 [text-shadow:0_0_10px_rgba(255,255,255,0.35)]' : 'bottom-[12px] right-[12px] text-[12.5px] text-white/80',
        )}
      >
        {p.venue.name}
      </p>
    </Link>
  );
}

/** Owner "Artists" tab card: name, basis, time slot, date, photo on the right. */
export function ArtistSlotCard({ p }: { p: PerformanceBrief }) {
  return (
    <Link href={`/sets/${p.id}`} className="relative -mb-[30px] block h-[132px] overflow-hidden rounded-[22px] shadow-[0_-8px_24px_rgba(0,0,0,0.45)] last:mb-0" style={{ background: 'linear-gradient(180deg,#4a2f3e,#2a1622)' }}>
      {p.performer.imageUrl && <img src={p.performer.imageUrl} alt="" className="absolute bottom-0 right-0 h-full w-[52%] object-cover [mask-image:linear-gradient(90deg,transparent,#000_35%)]" loading="lazy" />}
      <div className="relative px-[14px] pt-[13px]">
        <p className="font-ui text-[15px] font-semibold tracking-wide text-white/85">{p.performer.name}</p>
        <div className="mt-[26px] font-din text-[11px] leading-[13.5px] tracking-[0.03em] text-white/90">
          <p>
            <b>Performance Basis:</b> {p.basis}
          </p>
          <p>
            <b>Time Slot:</b> {clock(p.startsAt)} - {clock(p.endsAt)}
          </p>
          <p>
            <b>Date:</b> {new Date(p.startsAt).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>
    </Link>
  );
}
