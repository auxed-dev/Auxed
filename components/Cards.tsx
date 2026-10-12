/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { clock } from '@/lib/format';
import { cx } from '@/lib/util';
import type { EventDTO, PerformanceBrief, TicketDTO } from '@/lib/types';

/** Request ticket: poster, who played it, your songs, and a perforated stub with your request count. */
export function RequestTicket({ t, className }: { t: TicketDTO; className?: string }) {
  const notch = 'calc(100% - 46px)';
  const mask = `radial-gradient(circle at ${notch} 0, transparent 9px, #000 9.5px) top / 100% 51% no-repeat, radial-gradient(circle at ${notch} 100%, transparent 9px, #000 9.5px) bottom / 100% 51% no-repeat`;
  const label = t.upvotes > 0 ? `Made ${t.requests} upvote request${t.requests === 1 ? '' : 's'}` : `Made ${t.requests} request${t.requests === 1 ? '' : 's'}`;
  return (
    <Link
      href={`/sets/${t.performanceId}`}
      className={cx('relative block h-[170px] w-[236px] shrink-0 overflow-hidden rounded-[22px] bg-[#0d1340]', className)}
      style={{ WebkitMask: mask, mask }}
    >
      {t.imageUrl && <img src={t.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/30 to-black/45" />
      <div className="absolute inset-y-0 left-0 right-[46px] flex flex-col justify-between p-3 pt-8">
        <div>
          <p className="truncate font-din text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white">Played by {t.performerName}</p>
          <p className="font-din text-[8px] tracking-[0.1em] text-white/80">
            {clock(t.from)}-{clock(t.to)} · {t.status === 'LIVE' ? 'LIVE NOW' : t.status === 'UPCOMING' ? 'UPCOMING' : t.venueName}
          </p>
        </div>
        <div className="space-y-0.5 pb-3">
          {t.songs.slice(0, 2).map((s) => (
            <p key={s} className="truncate font-din text-[9px] font-semibold uppercase tracking-[0.12em] text-white">
              -{s}
            </p>
          ))}
        </div>
      </div>
      {/* stub */}
      <div className="absolute inset-y-0 right-0 w-[46px] bg-black/35">
        <div className="absolute inset-y-3 left-0 border-l-[3px] border-dotted border-white/85" />
        <div className="absolute inset-y-3 left-[7px] border-l border-white/70" />
        <p
          className="absolute left-1/2 top-1/2 w-[150px] -translate-x-1/2 -translate-y-1/2 rotate-90 text-center font-din text-[10px] font-bold uppercase tracking-[0.12em] text-[#f5e642]"
          style={{ textShadow: '0 0 6px rgba(0,0,0,0.6)' }}
        >
          {label}
        </p>
      </div>
    </Link>
  );
}

/** "At the Festie" card (232 x 178 in the design): poster, name, place and the REQUEST pill. */
export function FestieCard({ e }: { e: EventDTO }) {
  return (
    <div className="relative h-[178px] w-[232px] shrink-0 overflow-hidden rounded-[22px] shadow-[0_14px_30px_-14px_rgba(0,0,0,0.9)]" style={{ background: e.heroColor }}>
      <Link href={`/events/${e.id}`} className="absolute inset-0" aria-label={e.title}>
        {e.imageUrl && <img src={e.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-45% to-black/70" />
        <div className="absolute inset-0 rounded-[22px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" />
        {e.live && <span className="absolute left-3 top-3 h-2 w-2 animate-pulseGlow rounded-full bg-red-500 shadow-[0_0_8px_rgba(255,60,60,0.9)]" aria-label="Live now" />}
        <div className="absolute bottom-[10px] left-[10px] right-[96px]">
          <p className="truncate font-din text-[13px] font-bold uppercase tracking-[0.06em] text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">{e.title}</p>
          <p className="truncate font-num text-[10px] font-light text-white/95">{e.subtitle}</p>
        </div>
      </Link>
      <Link
        href={`/events/${e.id}`}
        className="absolute bottom-[12px] right-[14px] flex h-[28px] w-[86px] items-center justify-center rounded-full font-din text-[8.5px] font-bold uppercase tracking-[0.16em] text-white"
        style={{ background: 'linear-gradient(180deg,#3d52c9,#2738a3)', boxShadow: '0 0 14px rgba(70,100,240,0.55), inset 0 1px 3px rgba(255,255,255,0.3)' }}
      >
        Request
      </Link>
    </div>
  );
}

/** "In Da Club" card: a live or upcoming club set. Alternates wide and narrow like the design. */
export function ClubCard({ p, narrow }: { p: PerformanceBrief; narrow?: boolean }) {
  return (
    <Link href={`/sets/${p.id}`} className={`relative block h-[196px] shrink-0 overflow-hidden rounded-[18px] bg-[#120a0a] ${narrow ? 'w-[120px]' : 'w-[232px]'}`}>
      {(p.imageUrl ?? p.venue.imageUrl) && <img src={(p.imageUrl ?? p.venue.imageUrl)!} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-60% to-black/75" />
      {p.status === 'LIVE' && <span className="absolute left-3 top-3 h-2 w-2 animate-pulseGlow rounded-full bg-red-500 shadow-[0_0_8px_rgba(255,60,60,0.9)]" aria-label="Live now" />}
      <div className="absolute bottom-2.5 left-2.5 right-2.5">
        <p className="truncate font-din text-[11.5px] font-bold uppercase tracking-[0.06em] text-white">{p.venue.name}</p>
        <p className="truncate font-num text-[9.5px] font-light text-white/85">
          {p.performer.name} · {p.status === 'LIVE' ? 'now' : clock(p.startsAt)}
        </p>
      </div>
    </Link>
  );
}
