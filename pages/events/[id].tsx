/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useRef, useState } from 'react';
import { Screen } from '@/components/Screen';
import { ErrorNote, Sheet, TabPills } from '@/components/ui';
import { IconBack, IconChevronDown } from '@/components/Icons';
import { Loader } from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { clock, longDate } from '@/lib/format';
import { cx } from '@/lib/util';
import type { EventDTO, PerformanceBrief, StageDTO } from '@/lib/types';

const TABS = ['Stage', 'Genre', 'Artist', 'LIVE'] as const;
type Tab = (typeof TABS)[number];
type Sort = 'Spotlight' | 'Set time' | 'A–Z';

export default function EventPage() {
  const router = useRouter();
  const toast = useToast();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const { data, error, reload } = useApi<{ event: EventDTO }>(id ? `/api/events/${id}` : null, { refreshMs: 20_000 });
  const [tab, setTab] = useState<Tab>('Stage');
  const [desc, setDesc] = useState(false);
  const [sort, setSort] = useState<Sort>('Spotlight');
  const scroller = useRef<HTMLDivElement>(null);
  const e = data?.event;

  const stages = useMemo(() => {
    if (!e) return [];
    if (tab === 'LIVE') return e.stages.filter((s) => s.performance?.status === 'LIVE');
    return e.stages;
  }, [e, tab]);

  const genres = useMemo(() => {
    const m = new Map<string, StageDTO[]>();
    (e?.stages ?? []).forEach((s) => {
      const g = s.genre ?? 'Mixed';
      m.set(g, [...(m.get(g) ?? []), s]);
    });
    return [...m.entries()];
  }, [e]);

  const artists = useMemo(() => {
    const list = (e?.stages ?? []).filter((s) => s.performance).map((s) => ({ stage: s, p: s.performance! }));
    if (sort === 'Set time') list.sort((a, b) => a.p.startsAt.localeCompare(b.p.startsAt));
    else if (sort === 'A–Z') list.sort((a, b) => a.p.performer.name.localeCompare(b.p.performer.name));
    else list.sort((a, b) => Number(b.p.status === 'LIVE') - Number(a.p.status === 'LIVE') || b.p.crowdEstimate - a.p.crowdEstimate);
    return list;
  }, [e, sort]);

  const openStage = (s: StageDTO) => {
    if (s.performance) router.push(`/sets/${s.performance.id}`);
    else toast('No set has been announced for this stage yet.');
  };

  if (error && !e)
    return (
      <Screen nav title="Event">
        <div className="pt-24">
          <ErrorNote message={error.message} onRetry={reload} />
        </div>
      </Screen>
    );
  if (!e) return <Loader />;

  return (
    <Screen nav theme="blue" title={e.title}>
      {/* Poster */}
      <div className="relative h-[356px] overflow-hidden" style={{ background: e.heroColor }}>
        {e.imageUrl && <img src={e.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-b from-transparent via-[#0b1660]/70 to-[#0b1660]" />
        <button type="button" aria-label="Back" onClick={() => (window.history.length > 1 ? router.back() : router.push('/home'))} className="absolute right-5 top-[max(60px,calc(env(safe-area-inset-top)+34px))] text-white drop-shadow">
          <IconBack size={34} />
        </button>
        <div className="absolute bottom-[14px] left-4 right-24">
          <h1 className="font-din text-[23px] font-extrabold uppercase leading-none tracking-[0.02em] text-white glow-text">{e.title}</h1>
          <p className="font-num text-[12.5px] font-light tracking-wide text-white/90">{e.location}</p>
          <button type="button" onClick={() => setDesc(true)} className="mt-3 font-num text-[11.5px] font-semibold tracking-wide text-white underline underline-offset-2">
            See Description
          </button>
        </div>
        <Notes className="absolute bottom-6 right-20" />
      </div>

      <TabPills
        tabs={TABS}
        value={tab}
        onChange={setTab}
        variant="blue"
        className="mt-2"
        render={(t) =>
          t === 'LIVE' ? (
            <span className="flex items-center gap-2 font-din font-bold tracking-wider">
              <span className="h-[11px] w-[11px] rounded-full bg-red-500" /> LIVE
            </span>
          ) : (
            t
          )
        }
      />

      {(tab === 'Stage' || tab === 'LIVE') && (
        <div className="relative mt-3">
          <div ref={scroller} className="no-scrollbar grid snap-x snap-mandatory auto-cols-[237px] grid-flow-col grid-rows-2 gap-[10px] overflow-x-auto px-[14px] pb-2">
            {stages.map((s, i) => (
              <StageCard key={s.id} s={s} index={i} poster={e.imageUrl} onClick={() => openStage(s)} />
            ))}
          </div>
          {stages.length > 2 && (
            <button
              type="button"
              aria-label="Scroll stages"
              onClick={() => scroller.current?.scrollBy({ left: 300, behavior: 'smooth' })}
              className="absolute right-[8px] top-[124px] flex h-[106px] w-[94px] items-center justify-center"
            >
              <svg viewBox="0 0 94 106" className="h-full w-full" aria-hidden>
                <path d="M14 12 44 53 14 94" stroke="rgba(150,160,225,0.55)" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <path d="M50 12 80 53 50 94" stroke="rgba(150,160,225,0.55)" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </button>
          )}
          {stages.length === 0 && <p className="px-6 py-10 text-center font-ui text-sm text-white/60">{tab === 'LIVE' ? 'Nothing live right now — check back soon.' : 'Stages will be announced soon.'}</p>}
        </div>
      )}

      {tab === 'Genre' && (
        <div className="mt-3 space-y-5">
          {genres.map(([g, list]) => (
            <section key={g}>
              <h2 className="mb-2 px-6 font-din text-[14px] font-bold uppercase tracking-[0.14em] text-white/85">{g}</h2>
              <div className="no-scrollbar flex snap-x gap-[14px] overflow-x-auto px-5">
                {list.map((s, i) => (
                  <StageCard key={s.id} s={s} index={i} poster={e.imageUrl} onClick={() => openStage(s)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === 'Artist' && (
        <div className="mt-1 px-[4px]">
          <div className="mb-2 flex justify-end px-3">
            <label className="relative flex items-center gap-1 font-din text-[12.5px] font-bold uppercase tracking-[0.12em] text-white/90">
              <select value={sort} onChange={(ev) => setSort(ev.target.value as Sort)} className="appearance-none bg-transparent pr-4 uppercase outline-none" aria-label="Sort artists">
                {(['Spotlight', 'Set time', 'A–Z'] as Sort[]).map((s) => (
                  <option key={s} value={s} className="bg-black">
                    {s}
                  </option>
                ))}
              </select>
              <IconChevronDown size={11} className="pointer-events-none absolute right-0" />
            </label>
          </div>
          <div className="flex flex-col gap-[8px]">
            {artists.map(({ stage, p }, i) => (
              <ArtistCard key={p.id} p={p} stageName={stage.name} tint={TINTS[i % TINTS.length]} />
            ))}
            {artists.length === 0 && <p className="py-10 text-center font-ui text-sm text-white/60">The line-up drops soon.</p>}
          </div>
        </div>
      )}

      <Sheet open={desc} onClose={() => setDesc(false)} title={e.title}>
        <p className="font-ui text-[14px] leading-relaxed text-white/85">{e.description || 'More details coming soon.'}</p>
        <p className="mt-4 font-din text-[12px] font-bold uppercase tracking-wider text-white/60">
          {longDate(e.startsAt)} · {clock(e.startsAt)} – {longDate(e.endsAt)} · {clock(e.endsAt)}
        </p>
        <p className="mt-1 font-ui text-[13px] text-white/70">{e.location}</p>
      </Sheet>
    </Screen>
  );
}

/** Card tints from the design: silver, blue and gold duotones, cycling down the list. */
const TINTS = [
  { edge: '#d8d8d2', mid: 'rgba(236,236,228,0.55)', photo: 'grayscale(1) contrast(1.1) brightness(1.05)', name: ['#f4f4f4', '#6b6b6b'], btn: ['#8d8d8d', '#4b4b4b'] },
  { edge: '#3b4aa8', mid: 'rgba(52,66,170,0.5)', photo: 'grayscale(0.35) saturate(0.8) brightness(0.95)', name: ['#5b6fe0', '#1d2a7a'], btn: ['#4a5bc4', '#25318a'] },
  { edge: '#c9b65b', mid: 'rgba(196,178,82,0.55)', photo: 'grayscale(1) sepia(0.35) brightness(1.05)', name: ['#f2dc6d', '#8a7520'], btn: ['#c6ae48', '#8a7520'] },
];

/** Line-up card: duotone photo with the tint glowing in from the edges, embossed name, REQUEST BID / LIVE UPVOTE. */
function ArtistCard({ p, stageName, tint }: { p: PerformanceBrief; stageName: string; tint: (typeof TINTS)[number] }) {
  const router = useRouter();
  const live = p.status === 'LIVE';
  return (
    <div className="relative h-[140px] overflow-hidden rounded-[26px]" style={{ background: tint.edge }}>
      <Link href={`/sets/${p.id}`} className="absolute inset-0" aria-label={`${p.performer.name} — open set`}>
        {p.performer.imageUrl && <img src={p.performer.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_28%]" style={{ filter: tint.photo }} loading="lazy" />}
        <div className="absolute inset-0" style={{ background: `radial-gradient(75% 85% at 50% 45%, transparent 35%, ${tint.mid} 75%, ${tint.edge} 100%)` }} />
        <div className="absolute inset-0 shadow-[inset_0_0_26px_rgba(0,0,0,0.35)]" />
      </Link>
      <div className="pointer-events-none absolute bottom-[22px] left-[12px] right-[118px]">
        <p
          className="semi-x truncate font-wide text-[25px] font-black uppercase leading-none tracking-[0.02em]"
          style={{
            background: `linear-gradient(180deg, ${tint.name[0]} 0%, ${tint.name[1]} 100%)`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            WebkitTextStroke: '0.6px rgba(0,0,0,0.45)',
            filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.6))',
          }}
        >
          {p.performer.name}
        </p>
        <p className="mt-1.5 truncate font-din text-[9px] font-bold uppercase tracking-[0.14em] text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,0.7)]">
          {stageName} · {live ? 'Live now' : `${clock(p.startsAt)}–${clock(p.endsAt)}`}
        </p>
      </div>
      <div className="absolute bottom-[14px] right-[16px] flex flex-col gap-[6px]">
        <TintButton tint={tint} onClick={() => router.push(`/sets/${p.id}?request=1`)}>
          Request Bid
        </TintButton>
        <TintButton tint={tint} onClick={() => router.push(`/sets/${p.id}#queue`)}>
          {live ? 'Live Upvote' : 'Set List'}
        </TintButton>
      </div>
    </div>
  );
}

function TintButton({ tint, onClick, children }: { tint: (typeof TINTS)[number]; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[24px] w-[80px] items-center justify-center rounded-full font-din text-[7.5px] font-bold uppercase tracking-[0.14em] text-white transition active:scale-95"
      style={{ background: `linear-gradient(180deg, ${tint.btn[0]}, ${tint.btn[1]})`, boxShadow: '0 4px 10px rgba(0,0,0,0.45), inset 0 1px 2px rgba(255,255,255,0.35)' }}
    >
      {children}
    </button>
  );
}

const STAGE_TINTS = ['#4b63d6', '#d9b23f', '#b8b8b8', '#9a9a9a'];

/** Stage card (237 x 186): poster with its tint glowing in from the edges and an embossed stage name. */
function StageCard({ s, index, poster, onClick }: { s: StageDTO; index: number; poster: string | null; onClick: () => void }) {
  const img = s.imageUrl ?? s.performance?.imageUrl ?? poster;
  const vip = /vip/i.test(s.name);
  const tint = vip ? STAGE_TINTS[1] : STAGE_TINTS[index % STAGE_TINTS.length === 1 ? 0 : index % STAGE_TINTS.length];
  return (
    <button type="button" onClick={onClick} className="relative h-[186px] w-[237px] shrink-0 snap-start overflow-hidden rounded-[28px] bg-[#0e9f5a] text-left shadow-[0_12px_26px_-14px_rgba(0,0,0,0.9)]">
      {img && <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
      <div className="absolute inset-0 rounded-[28px]" style={{ boxShadow: `inset 0 0 22px 6px ${tint}cc` }} />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-55% to-black/45" />
      {s.performance?.status === 'LIVE' && (
        <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 font-din text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulseGlow rounded-full bg-red-500" /> Live · {s.performance.performer.name}
        </span>
      )}
      <span
        className="absolute bottom-[22px] left-[20px] right-3 truncate font-din text-[15px] font-extrabold uppercase tracking-[0.02em]"
        style={
          vip
            ? { background: 'linear-gradient(180deg,#fff27a,#c9a31c)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.7))' }
            : { color: '#fff', textShadow: '0 2px 2px rgba(0,0,0,0.75), 0 0 1px rgba(0,0,0,0.9)' }
        }
      >
        {s.name}
      </span>
    </button>
  );
}

function Notes({ className }: { className?: string }) {
  return (
    <svg width="44" height="50" viewBox="0 0 44 50" className={cx('animate-floaty', className)} aria-hidden>
      {[
        [6, 30],
        [20, 18],
        [30, 34],
        [34, 6],
      ].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(-12)`} fill="#fff" opacity={0.9}>
          <ellipse cx="3" cy="9" rx="3.2" ry="2.4" />
          <rect x="5.4" y="0" width="1.4" height="9" />
          <path d="M6.8 0c2 1 3.6 2 3.6 4" stroke="#fff" strokeWidth="1.4" fill="none" />
        </g>
      ))}
    </svg>
  );
}
