/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/util';
import { IconChevronRight } from './Icons';

/* ------------------------------------------------------------------ tabs */

export function TabPills<T extends string>({
  tabs,
  value,
  onChange,
  variant = 'grey',
  className,
  render,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (t: T) => void;
  variant?: 'grey' | 'blue' | 'dash';
  className?: string;
  render?: (t: T) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [value]);
  return (
    <div ref={ref} role="tablist" className={cx('no-scrollbar flex overflow-x-auto px-3 py-2', variant === 'dash' ? 'gap-[12px]' : 'gap-[14px]', className)}>
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          type="button"
          aria-selected={t === value}
          data-active={t === value}
          onClick={() => onChange(t)}
          className={cx('tab-pill', variant === 'blue' && t !== value && 'tab-pill-blue', variant === 'dash' && 'tab-pill-dash')}
        >
          {render ? render(t) : t}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- buttons */

export function GlassButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cx('glass-pill h-[68px] w-full text-[17px] transition active:scale-[0.98] disabled:opacity-60', className)} {...rest}>
      {children}
    </button>
  );
}

export function LimeButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        'rounded-full bg-gradient-to-b from-[#d9f74a] to-[#b5e01f] px-6 py-3 font-ui text-[16px] font-semibold text-lime-ink shadow-[0_0_22px_rgba(201,241,59,0.35)] transition active:scale-[0.98] disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Round arrow at the right edge of summary cards (cycles the card's content). */
export function CardArrow({ onClick, label = 'Next summary' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="absolute right-3 top-1/2 z-10 flex h-[28px] w-[28px] -translate-y-1/2 items-center justify-center rounded-full bg-[#0d0716] text-accent-soft shadow-[0_0_10px_rgba(0,0,0,0.6)] transition active:scale-90"
    >
      <IconChevronRight size={13} />
    </button>
  );
}

/** Dark navy pill with a round chevron (home quick links / dashboard shortcuts). */
export function ChipLink({
  children,
  icon,
  onClick,
  className,
  size = 'md',
}: {
  children: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <button type="button" onClick={onClick} className={cx('chip-btn w-full', size === 'sm' && '!h-[27px] gap-1 !pl-2.5 !pr-[3px] !text-[9.5px]', className)}>
      <span className="truncate">{children}</span>
      <span className={cx('flex shrink-0 items-center justify-center rounded-full bg-black/45 text-white/80', size === 'sm' ? 'h-[21px] w-[21px]' : 'h-[24px] w-[24px]')}>
        {icon ?? <IconChevronRight size={size === 'sm' ? 10 : 12} />}
      </span>
    </button>
  );
}

/* ----------------------------------------------------------------- avatar */

export function Avatar({ src, name, size = 52, ring, className }: { src?: string | null; name?: string; size?: number; ring?: string | null; className?: string }) {
  const initials = (name ?? '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'A';
  return (
    <span
      className={cx('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1b1b22]', className)}
      style={{ width: size, height: size, boxShadow: `0 0 0 ${Math.max(2, Math.round(size / 14))}px ${ring ?? 'rgba(255,255,255,0.85)'}` }}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="font-din font-bold text-white/80" style={{ fontSize: size * 0.34 }}>
          {initials}
        </span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- marquee */

export function Marquee({ text, className, speed = 18 }: { text: string; className?: string; speed?: number }) {
  const item = `${text} • `;
  return (
    <div className={cx('relative overflow-hidden whitespace-nowrap', className)} aria-label={text}>
      <div className="inline-flex animate-marquee" style={{ animationDuration: `${speed}s` }} aria-hidden>
        <span className="pr-2">{item.repeat(4)}</span>
        <span className="pr-2">{item.repeat(4)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sheet */

export function Sheet({ open, onClose, children, title, className }: { open: boolean; onClose: () => void; children: ReactNode; title?: string; className?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] mx-auto flex max-w-[var(--app-w)] flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 animate-fadeIn bg-black/65 backdrop-blur-[3px]" onClick={onClose} />
      <div
        className={cx(
          'relative max-h-[88dvh] animate-sheetUp overflow-y-auto rounded-t-[34px] border-t border-white/10 px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_60px_rgba(0,0,0,0.7)]',
          className,
        )}
        style={{ background: 'linear-gradient(180deg, rgb(var(--surface)) 0%, rgb(var(--accent-deep)) 60%, #050507 100%)' }}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/25" />
        {title && <h2 className="mb-4 text-center font-din text-[15px] font-bold uppercase tracking-[0.14em] text-white/90">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ misc */

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx('font-din text-[15px] font-bold uppercase tracking-[0.06em] text-white/80', className)}>{children}</h2>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="panel mx-4 flex flex-col items-center gap-2 px-6 py-8 text-center">
      <p className="font-din text-[15px] font-bold uppercase tracking-wide text-white/85">{title}</p>
      {body && <p className="max-w-[280px] font-ui text-[13px] leading-relaxed text-white/55">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-4 rounded-2xl border border-red-400/25 bg-red-950/50 px-4 py-3 font-ui text-[13px] text-red-100">
      {message}
      {onRetry && (
        <button type="button" onClick={onRetry} className="ml-2 font-semibold underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-[30px] w-[52px] shrink-0 rounded-full transition', checked ? 'bg-lime' : 'bg-white/20')}
    >
      <span className={cx('absolute top-[3px] h-[24px] w-[24px] rounded-full bg-white shadow transition-all', checked ? 'left-[25px]' : 'left-[3px]')} />
    </button>
  );
}
