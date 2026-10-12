/* eslint-disable @next/next/no-img-element */
import { cx } from '@/lib/util';

/** The swirl "A" mark (white on transparent). */
export function LogoA({ size = 48, className, glow }: { size?: number; className?: string; glow?: boolean }) {
  return (
    <img
      src={size > 128 ? '/brand/auxed-a-512.png' : size > 64 ? '/brand/auxed-a-256.png' : '/brand/auxed-a-128.png'}
      alt="AUXED"
      width={Math.round(size * 0.793)}
      height={size}
      draggable={false}
      className={cx('select-none', glow && 'drop-shadow-[0_0_14px_rgba(255,255,255,0.45)]', className)}
      style={{ height: size, width: 'auto' }}
    />
  );
}

/** AUXED wordmark: heavy expanded letters filled with the swirl pattern. */
export function Wordmark({ className, tagline = true }: { className?: string; tagline?: boolean }) {
  return (
    <div className={cx('flex flex-col items-center', className)}>
      <span
        className="wide-x block font-wide text-[78px] font-black leading-[0.86] tracking-[-0.01em]"
        style={{
          backgroundImage: "url('/brand/auxed-a-128.png'), url('/brand/auxed-a-128.png'), linear-gradient(180deg, #b7c6f5 0%, #7d95e0 55%, #5b74cc 100%)",
          backgroundSize: '19px 24px, 19px 24px, 100% 100%',
          backgroundPosition: '0 0, 9px 12px, 0 0',
          backgroundRepeat: 'repeat, repeat, no-repeat',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextStroke: '0.6px rgba(20,30,80,0.35)',
          filter: 'drop-shadow(0 0 1px rgba(160,180,255,0.4))',
        }}
      >
        AUXED
      </span>
      {tagline && (
        <span className="semi-x mt-2 font-wide text-[13.5px] font-semibold tracking-[0.18em] text-[#6f87dc]">POWER TO THE MUSIC LOVERS</span>
      )}
    </div>
  );
}

/** Full-bleed topographic background in the role colour (from the design files). */
export function Topo({ theme, className }: { theme: 'blue' | 'green' | 'purple'; className?: string }) {
  return (
    <img
      src={`/art/topo-${theme}.svg`}
      alt=""
      aria-hidden
      draggable={false}
      className={cx('pointer-events-none absolute inset-0 h-full w-full select-none object-cover', className)}
    />
  );
}
