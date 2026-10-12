import { cx } from '@/lib/util';
import type { VenueDTO } from '@/lib/types';

/** The venue name set as a wordmark, in the style the venue picked. */
export function VenueLogo({ name, style, className, size = 'lg' }: { name: string; style: VenueDTO['logoStyle']; className?: string; size?: 'lg' | 'md' | 'sm' }) {
  const upper = name.toUpperCase();
  const scale = size === 'lg' ? 1 : size === 'md' ? 0.62 : 0.4;
  if (style === 'serif') {
    return (
      <span className={cx('block font-display font-black leading-[0.9] tracking-[0.01em] text-white', className)} style={{ fontSize: 64 * scale }}>
        {upper}
      </span>
    );
  }
  if (style === 'cond') {
    return (
      <span className={cx('block font-cond uppercase leading-[0.92] tracking-[0.02em] text-white', className)} style={{ fontSize: 60 * scale }}>
        {upper}
      </span>
    );
  }
  const [first, ...rest] = upper.split(' ');
  const tail = rest.join(' ');
  const firstSize = (first.length > 8 ? 46 : first.length > 6 ? 56 : 62) * scale;
  return (
    <span className={cx('block font-wide font-black leading-[0.86] text-white', className)} style={{ fontStretch: '112%' }}>
      <span className="block" style={{ fontSize: firstSize }}>
        {first}
      </span>
      {tail && (
        <span className="block" style={{ fontSize: Math.min(firstSize * 0.72, (tail.length > 10 ? 30 : 40) * scale) }}>
          {tail}
        </span>
      )}
    </span>
  );
}
