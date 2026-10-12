import { useId } from 'react';
import { compact, grouped } from '@/lib/format';
import { LogoPlaceholder } from './Loader';

/** Slice colours from the design: [centre, edge] per slice. */
const DONUT_TONES = [
  ['#33659a', '#b9cbe0'],
  ['#7e45a6', '#d8bde3'],
  ['#4a7764', '#b4c5bd'],
];

/**
 * Artist "Statistical Summary": the whole card in one SVG laid out on the design's 361 x 256 grid.
 * Three slices (top genres), each shaded from its centre outwards; labels sit where the design
 * puts them (top-left, bottom-left, bottom-right) with elbow leader lines from each slice.
 */
export function StatDonutCard({ title, data }: { title: string; data: { name: string; pct: number }[] }) {
  const id = useId().replace(/:/g, '');
  const top = data.filter((d) => d.pct > 0 && d.name !== 'On The Mic').slice(0, 3);
  const total = top.reduce((a, d) => a + d.pct, 0) || 1;
  // Round to whole percentages that add up to 100.
  const raw = top.map((d) => (d.pct / total) * 100);
  const pcts = raw.map(Math.floor);
  let left = 100 - pcts.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - Math.floor(v), i] as const).sort((x, y) => y[0] - x[0]).forEach(([, i]) => left-- > 0 && (pcts[i] += 1));

  const cx = 179;
  const cy = 136;
  const r = 87.5;
  const hole = 18.5;
  const ELBOWS = [
    { elbow: [119, 54], end: [24, 54], text: [22, 46], anchor: 'start' as const },
    { elbow: [115, 224], end: [24, 224], text: [28, 238], anchor: 'start' as const },
    { elbow: [246, 228], end: [328, 228], text: [331, 242], anchor: 'end' as const },
  ];
  // Design layout: genre 1 over the top, genre 3 bottom-right, genre 2 bottom-left (clockwise from the left).
  const order = top.length === 3 ? [0, 2, 1] : top.map((_, i) => i);
  let angle = Math.PI;
  const slices = order.map((i) => {
    const d = top[i];
    const sweep = (pcts[i] / 100) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const pt = (a: number, rr: number) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
    const [x0, y0] = pt(a0, r);
    const [x1, y1] = pt(a1, r);
    const path =
      top.length === 1
        ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`
        : `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    const mid = (a0 + a1) / 2;
    const [gx, gy] = pt(mid, r * 0.5);
    const [lx, ly] = pt(mid, r * 0.62);
    return { d, i, path, gx, gy, lx, ly, pct: pcts[i] };
  });

  return (
    <div className="relative h-full">
      <svg viewBox="0 0 361 256" className="absolute inset-0 h-full w-full" role="img" aria-label={slices.map((s) => `${s.pct}% ${s.d.name}`).join(', ') || 'No requests yet'}>
        <defs>
          {slices.map((s) => (
            <radialGradient key={s.i} id={`${id}s${s.i}`} cx={s.gx} cy={s.gy} r={r * 1.05} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor={DONUT_TONES[s.i][0]} />
              <stop offset="1" stopColor={DONUT_TONES[s.i][1]} />
            </radialGradient>
          ))}
        </defs>
        <text x="180.5" y="31" textAnchor="middle" fill="#e8e8e8" fontSize="15" fontWeight="700" letterSpacing="1" style={{ fontFamily: 'var(--font-barlow)' }}>
          {title}
        </text>
        {slices.length ? (
          <>
            {slices.map((s) => (
              <path key={s.i} d={s.path} fill={`url(#${id}s${s.i})`} />
            ))}
            <circle cx={cx} cy={cy} r={hole} fill="#050209" />
            {slices.map((s) => {
              const e = ELBOWS[s.i];
              return (
                <g key={`l${s.i}`}>
                  <polyline points={`${s.lx.toFixed(1)},${s.ly.toFixed(1)} ${e.elbow[0]},${e.elbow[1]} ${e.end[0]},${e.end[1]}`} fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="miter" />
                  <text x={e.text[0]} y={e.text[1]} textAnchor={e.anchor} fill="#fff" fontSize="7" fontWeight="700" letterSpacing="0.7" style={{ fontFamily: 'var(--font-barlow)' }}>
                    {`${s.pct}% ${s.d.name.toUpperCase()} REQUESTS`}
                  </text>
                </g>
              );
            })}
          </>
        ) : (
          <text x="180.5" y="140" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="11" style={{ fontFamily: 'var(--font-saira)' }}>
            Genre split appears after your first requests
          </text>
        )}
      </svg>
    </div>
  );
}

/** Kept for other screens: simple donut with callouts. */
export function GenreDonut({ data }: { data: { name: string; pct: number }[] }) {
  return <StatDonutCard title="" data={data} />;
}

const PIE_TONES = ['#4a52c4', '#ff2b2b', '#c3c67c', '#33c548', '#9b59c8', '#f0a030'];

/** "Genres: Profit Distribution" pie with circled percentage badges. */
export function ProfitPie({ data }: { data: { name: string; pct: number }[] }) {
  const id = useId().replace(/:/g, '');
  const slices = data.filter((d) => d.pct > 0).slice(0, 5);
  if (!slices.length) return <LogoPlaceholder size={140} />;
  const total = slices.reduce((a, d) => a + d.pct, 0);
  const cx = 200,
    cy = 150,
    r = 98;
  let angle = -Math.PI / 2;
  const arcs = slices.map((d, i) => {
    const sweep = (d.pct / total) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const p = (a: number, rr: number) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
    const [x0, y0] = p(a0, r);
    const [x1, y1] = p(a1, r);
    const path = slices.length === 1 ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0` : `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x1} ${y1} Z`;
    const mid = (a0 + a1) / 2;
    const [sx, sy] = p(mid, r * 0.55);
    const [bx, by] = p(mid, r + 62);
    return { d, i, path, sx, sy, bx: Math.max(40, Math.min(360, bx)), by: Math.max(38, Math.min(262, by)) };
  });
  return (
    <svg viewBox="0 0 400 300" className="h-auto w-full" role="img" aria-label={slices.map((s) => `${s.pct}% ${s.name}`).join(', ')}>
      <defs>
        {arcs.map(({ i }) => (
          <radialGradient key={i} id={`${id}p${i}`} cx={cx} cy={cy} r={r} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={PIE_TONES[i % PIE_TONES.length]} />
            <stop offset="1" stopColor={PIE_TONES[i % PIE_TONES.length]} stopOpacity="0.72" />
          </radialGradient>
        ))}
      </defs>
      {arcs.map(({ i, path }) => (
        <path key={i} d={path} fill={`url(#${id}p${i})`} />
      ))}
      <circle cx={cx} cy={cy} r="5" fill="#000" />
      {arcs.map(({ i, d, sx, sy, bx, by }) => (
        <g key={`b${i}`}>
          <path d={`M ${sx} ${sy} Q ${(sx + bx) / 2} ${sy} ${bx} ${by}`} fill="none" stroke="#fff" strokeWidth="2.5" />
          <circle cx={bx} cy={by} r="27" fill="#3a0d6b" stroke="#fff" strokeWidth="4.5" />
          <text x={bx} y={by + 1} textAnchor="middle" fill="#fff" fontSize="11.5" fontWeight="800" style={{ fontFamily: 'var(--font-barlow)' }}>
            {`${Math.round(d.pct * 10) / 10}%`}
          </text>
          <text x={bx} y={by + 11} textAnchor="middle" fill="#fff" fontSize="5.5" fontWeight="700" letterSpacing="0.4" style={{ fontFamily: 'var(--font-barlow)' }}>
            {d.name.toUpperCase().slice(0, 12)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** "Request Volume" line chart: thick lavender line over a rounded white axis. */
export function VolumeLine({ points, labels }: { points: number[]; labels: string[] }) {
  if (points.length < 2) return <LogoPlaceholder size={140} />;
  const max = Math.max(...points, 1);
  const top = niceMax(max);
  const W = 400,
    H = 260,
    x0 = 70,
    y0 = 212,
    x1 = 380,
    y1 = 24;
  const xs = (i: number) => x0 + 14 + ((x1 - x0 - 24) * i) / (points.length - 1);
  const ys = (v: number) => y0 - 14 - ((y0 - y1 - 14) * v) / top;
  const d = points.map((v, i) => `${i ? 'L' : 'M'} ${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join(' ');
  const ticks = [0.2, 0.4, 0.6, 0.8, 1].map((t) => Math.round(top * t));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Request volume over time">
      {ticks.map((t) => (
        <text key={t} x="14" y={ys(t) + 4} fill="#fff" fontSize="10" fontWeight="800" style={{ fontFamily: 'var(--font-barlow)' }}>
          {grouped(t)}
        </text>
      ))}
      <path d={smooth(points.map((v, i) => [xs(i), ys(v)]))} fill="none" stroke="#b79ae0" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
      <path d={d} fill="none" stroke="transparent" />
      <path d={`M ${x0} ${y1} L ${x0} ${y0 - 22} Q ${x0} ${y0} ${x0 + 22} ${y0} L ${x1} ${y0}`} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      {labels.map((l, i) => (
        <text
          key={l + i}
          x={x0 + 40 + ((x1 - x0 - 60) * i) / Math.max(1, labels.length - 1)}
          y={y0 + 28}
          textAnchor="middle"
          fill="#fff"
          fontSize="10.5"
          fontWeight="800"
          style={{ fontFamily: 'var(--font-barlow)' }}
        >
          {l}
        </text>
      ))}
    </svg>
  );
}

/** Minimal glowing bar chart used inside chart cards. */
export function Bars({ data, format = (n: number) => compact(n), max = 6, highlightLast }: { data: { name: string; value: number; dim?: boolean }[]; format?: (n: number) => string; max?: number; highlightLast?: boolean }) {
  const rows = data.slice(0, max);
  if (!rows.length) return <LogoPlaceholder size={110} />;
  const top = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex h-[150px] items-end gap-2.5 pt-2">
      {rows.map((r, i) => (
        <div key={r.name + i} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="font-din text-[10px] font-bold text-white/85">{format(r.value)}</span>
          <div
            className="w-full rounded-t-[10px] rounded-b-[4px]"
            style={{
              height: `${Math.max(6, (r.value / top) * 96)}px`,
              background: r.dim ? 'rgba(255,255,255,0.28)' : highlightLast && i === rows.length - 1 ? '#C9F13B' : 'linear-gradient(180deg,#ffffff,rgba(255,255,255,0.55))',
              boxShadow: r.dim ? undefined : '0 0 14px rgba(255,255,255,0.25)',
            }}
          />
          <span className="w-full truncate text-center font-din text-[8.5px] font-bold uppercase tracking-wide text-white/70">{r.name}</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars with labels (genre distributions, revenue mapping). */
export function HBars({ data, format = (n: number) => compact(n), max = 6 }: { data: { name: string; value: number }[]; format?: (n: number) => string; max?: number }) {
  const rows = data.slice(0, max);
  if (!rows.length) return <LogoPlaceholder size={110} />;
  const top = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex flex-col gap-2.5 py-1">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-3">
          <span className="w-[92px] shrink-0 truncate font-din text-[10.5px] font-bold uppercase tracking-wide text-white/80">{r.name}</span>
          <div className="h-[12px] flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-white/60 to-white shadow-[0_0_10px_rgba(255,255,255,0.35)]" style={{ width: `${Math.max(4, (r.value / top) * 100)}%` }} />
          </div>
          <span className="w-[54px] shrink-0 text-right font-din text-[10.5px] font-bold text-white/85">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

function niceMax(v: number) {
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Catmull-Rom → cubic Bézier for a smooth line. */
function smooth(pts: number[][]) {
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ');
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
