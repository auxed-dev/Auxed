/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { AuxedPage } from './_app';
import { Screen } from '@/components/Screen';
import { IconHeart, IconRepost } from '@/components/Icons';
import { Skeleton } from '@/components/Loader';
import { useApi } from '@/lib/client/useApi';
import { compact } from '@/lib/format';
import { hashString } from '@/lib/util';
import type { PerformanceBrief, PostDTO } from '@/lib/types';

interface VibesData {
  snippets: { performance: PerformanceBrief; label: string }[];
  recent: { performance: PerformanceBrief; topReactions: PostDTO[] }[];
  featured: PerformanceBrief[];
}

const RINGS = ['#c9302c', '#d2461f', '#ff4fa3', '#2f6fb7', '#b3202a', '#3a3a3a', '#8a5cff'];

/** Stream The Vibe: live snippets, recent sets and the sets everyone's talking about. */
const Vibes: AuxedPage = () => {
  const { data } = useApi<VibesData>('/api/vibes', { refreshMs: 30_000 });

  return (
    <Screen nav title="Stream the vibe">
      <section className="panel mx-0 mt-[max(70px,calc(env(safe-area-inset-top)+44px))] rounded-[6px] pb-4 pt-4">
        <h1 className="px-6 font-ui text-[21px] font-semibold tracking-wide text-white/90">Live Snippets</h1>
        <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-4">
          {!data && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] w-[92px] shrink-0 !rounded-full" />)}
          {data?.snippets.map(({ performance: p, label }, i) => (
            <Link key={p.id} href={`/sets/${p.id}`} className="relative flex w-[92px] shrink-0 flex-col items-center gap-1.5">
              {i === Math.min(2, (data.snippets.length || 1) - 1) && <span className="absolute -top-2 right-0 z-10 animate-floaty text-[16px] text-white drop-shadow">♪♫</span>}
              <span className="h-[90px] w-[90px] overflow-hidden rounded-full bg-black" style={{ boxShadow: `0 0 0 4px ${RINGS[hashString(p.performer.name) % RINGS.length]}` }}>
                {(p.performer.imageUrl ?? p.venue.imageUrl) && <img src={(p.performer.imageUrl ?? p.venue.imageUrl)!} alt="" className="h-full w-full object-cover" loading="lazy" />}
              </span>
              <span className="w-full truncate text-center font-din text-[10px] font-bold tracking-wide text-white/85">{label}</span>
            </Link>
          ))}
          {data && data.snippets.length === 0 && <p className="px-2 py-6 font-ui text-sm text-white/60">No one is live right now.</p>}
        </div>
      </section>

      <h2 className="mt-7 text-center font-din text-[17px] font-bold uppercase tracking-[0.1em] text-white/85">Recent Set</h2>
      <div className="no-scrollbar mt-4 flex snap-x gap-4 overflow-x-auto px-0 pb-1">
        {data?.recent.map(({ performance: p, topReactions }) => (
          <Link
            key={p.id}
            href={`/sets/${p.id}`}
            className="relative h-[182px] w-[292px] shrink-0 snap-start overflow-hidden rounded-[38px] first:ml-0"
            style={{ background: 'linear-gradient(135deg, rgb(var(--surface)) 0%, rgb(var(--accent-deep)) 55%, rgb(var(--surface)) 100%)', boxShadow: 'inset 0 0 30px rgba(255,255,255,0.05)' }}
          >
            <span className="absolute -left-[64px] top-1/2 h-[128px] w-[128px] -translate-y-1/2 overflow-hidden rounded-full bg-black shadow-[0_0_20px_rgba(0,0,0,0.6)]">
              {(p.venue.imageUrl ?? p.imageUrl) && <img src={(p.venue.imageUrl ?? p.imageUrl)!} alt="" className="h-full w-full object-cover" loading="lazy" />}
            </span>
            <div className="absolute inset-y-0 left-[54px] right-5 flex flex-col justify-center">
              <p className="truncate font-ui text-[25px] font-semibold tracking-wide text-white/90">{p.venue.name}</p>
              <p className="mt-1 font-din text-[14px] font-bold text-white">Top Reactions</p>
              {topReactions.length ? (
                topReactions.map((r) => (
                  <p key={r.id} className="line-clamp-2 font-din text-[12.5px] leading-snug text-white/90">
                    <b>{r.author.userName}:</b> ‘{r.text}’
                  </p>
                ))
              ) : (
                <p className="font-din text-[12px] text-white/60">No reactions yet.</p>
              )}
              <p className="mt-2 flex items-center justify-end gap-2 font-din text-[14px] font-bold text-white">
                {compact(p.reposts)} <IconRepost size={20} /> {compact(p.likes)} <IconHeart size={22} />
              </p>
            </div>
          </Link>
        ))}
        {!data && <Skeleton className="h-[182px] w-[292px] shrink-0" />}
      </div>

      <div className="mt-6 flex flex-col gap-6 px-[10px]">
        {data?.featured.map((p) => (
          <article key={p.id}>
            <Link href={`/sets/${p.id}`} className="relative block h-[272px] overflow-hidden rounded-[30px] bg-black">
              {(p.imageUrl ?? p.performer.imageUrl) && <img src={(p.imageUrl ?? p.performer.imageUrl)!} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/30" />
              <div className="absolute right-3 top-3 flex items-center gap-2">
                <span className="text-right font-ui text-[20px] font-semibold leading-[1.05] text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]">{p.venue.name}</span>
                {p.venue.imageUrl && <img src={p.venue.imageUrl} alt="" className="h-[68px] w-[68px] rounded-full object-cover shadow-[0_0_14px_rgba(0,0,0,0.6)]" />}
              </div>
            </Link>
            <div className="mt-3 flex gap-3 px-2">
              <div className="min-w-0 flex-1">
                <p className="font-ui text-[13px] font-semibold tracking-wide text-white">{p.performer.name}</p>
                {p.caption && <p className="mt-1 line-clamp-3 font-ui text-[9px] leading-[1.6] text-white/80">{p.caption}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <p className="flex items-center gap-2 font-din text-[14px] font-bold text-white">
                  {compact(p.reposts)} <IconRepost size={20} /> {compact(p.likes)} <IconHeart size={22} />
                </p>
                <Link href={`/sets/${p.id}`} className="rounded-full px-4 py-1.5 font-ui text-[10px] font-semibold text-white" style={{ background: 'rgb(var(--surface) / 0.9)', boxShadow: '0 0 12px rgb(var(--accent-soft) / 0.35)' }}>
                  See Set List
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </Screen>
  );
};

Vibes.auth = true;
export default Vibes;
