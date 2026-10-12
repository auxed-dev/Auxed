/** "R 24 687.56" — space thousands separator and a dot for decimals, as in the designs. */
export function rand(amount: number, opts: { decimals?: number; symbol?: boolean } = {}): string {
  const decimals = opts.decimals ?? 2;
  const fixed = Math.abs(amount).toFixed(decimals);
  const [whole, frac] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = amount < 0 ? '-' : '';
  const body = frac ? `${grouped}.${frac}` : grouped;
  return opts.symbol === false ? `${sign}${body}` : `${sign}R ${body}`;
}

/** Plain number with space grouping: 20 000 */
export function grouped(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** 27000 -> "27K", 1700 -> "1.7k" style used on vote and reaction counters. */
export function compact(n: number, upper = false): string {
  const k = upper ? 'K' : 'k';
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}${k}`;
  return String(n);
}

function trim(v: number): string {
  return v >= 10 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString();
}

/** 214 -> "3:34" */
export function duration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function clock(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

/** "Fri 26 Sept 2025" */
export function longDate(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "20/09/25" */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear().toString().slice(2)}`;
}

/** "Friday Evening" */
export function dayPart(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night';
  return `${LONG_DAYS[d.getDay()]} ${part}`;
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
}
