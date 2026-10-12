/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import type { AuxedPage } from '../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { ChipLink, EmptyState, TabPills } from '@/components/ui';
import { BookingCard, ChartCard, RevenueCircle, SummaryCarousel, SummaryTable } from '@/components/Dashboard';
import { Bars, HBars, StatDonutCard } from '@/components/Charts';
import { IconCheck } from '@/components/Icons';
import { Skeleton } from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { post, errorMessage } from '@/lib/client/api';
import { duration, rand } from '@/lib/format';
import { cx } from '@/lib/util';
import type { ArtistDashboard } from '@/lib/server/services/dashboards';
import type { RequestDTO } from '@/lib/types';

const TABS = ['Bookings', 'Requests', 'Analytics', 'Forecasts'] as const;
type Tab = (typeof TABS)[number];
const CARD_FOR_TAB: Record<Tab, number> = { Bookings: 0, Requests: 1, Analytics: 2, Forecasts: 3 };

const ArtistHome: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const [venueId, setVenueId] = useState('');
  const { data, reload } = useApi<ArtistDashboard>(`/api/artist/dashboard${venueId ? `?venueId=${venueId}` : ''}`, { refreshMs: 15_000 });
  const [tab, setTab] = useState<Tab>('Bookings');
  const [card, setCard] = useState(0);
  const micOnly = router.query.kind === 'MIC';

  useEffect(() => {
    const t = String(router.query.tab ?? '').toLowerCase();
    const found = TABS.find((x) => x.toLowerCase() === t);
    if (found) {
      setTab(found);
      setCard(CARD_FOR_TAB[found]);
    }
  }, [router.query.tab]);

  const pick = (t: Tab) => {
    setTab(t);
    setCard(CARD_FOR_TAB[t]);
  };

  async function decide(r: RequestDTO, action: 'approve' | 'reject') {
    try {
      await post(`/api/requests/${r.id}/decision`, { action });
      toast(action === 'approve' ? 'Added to your queue.' : 'Declined — tokens refunded.', 'success');
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  const a = data?.analytics;
  const thisWeek = (data?.bookings ?? []).filter((b) => b.status === 'LIVE' || new Date(b.startsAt).getTime() - Date.now() < 7 * 86400_000);
  const later = (data?.bookings ?? []).filter((b) => !thisWeek.includes(b));
  const requests = (data?.requests ?? []).filter((r) => (micOnly ? r.kind === 'MIC' : true));

  return (
    <Screen nav theme="green" title="Dashboard">
      <TitleBar title="Dashboard" className="!pb-[18px] !pt-[max(48px,calc(env(safe-area-inset-top)+22px))] [&_h1]:!text-[21px]" />

      {/* Summary card */}
      <SummaryCarousel index={card} count={4} onChange={setCard}>
        {!data ? (
          <Skeleton className="h-full !rounded-[22px]" />
        ) : card === 0 ? (
          <RevenueCircle cents={data.balanceCents} />
        ) : card === 1 ? (
          <StatDonutCard title="Statistical Summary" data={data.genreSplit} />
        ) : card === 2 ? (
          <SummaryTable
            title="Analytical Summary"
            inset={[16, 25]}
            rows={[
              { label: 'Most Trendy Playlist / Set', value: a?.trendySet },
              { label: 'Most Requested Track', value: a?.topTrack, bold: true },
              { label: 'Most Requested Genre', value: a?.topGenre },
              { label: 'Most Upvoted Set Track', value: a?.topUpvoted },
              'gap',
              { label: 'What The People Voted', value: '' },
              { label: 'for Next Set', value: a?.nextPick },
              { label: 'Time Slot', value: a?.timeSlot },
              { label: 'You’re Trending At', value: a?.trendingAt },
              { label: 'Set Improvement Rate', value: a?.improvementPct != null ? `${a.improvementPct}%` : null, bold: true },
            ]}
          />
        ) : (
          <div className="grid h-full grid-cols-2 content-center gap-x-[12px] gap-y-[11px] px-[38px]">
            <DashLink href="/artist/setbox">My Set Box</DashLink>
            <DashLink href="/wire">Chat to the Community</DashLink>
            <DashLink href="/artist/trinkets">The Peoples Trinkets</DashLink>
            <DashLink href="/wire?filter=management">Hear from Management</DashLink>
            <DashLink href={data.bookings.find((b) => b.status === 'LIVE') ? `/snippet?performanceId=${data.bookings.find((b) => b.status === 'LIVE')!.id}` : '/snippet'}>Post A Pic Snippet</DashLink>
            <DashLink href="/artist/controls">My Creative Controls</DashLink>
            <DashLink href="/artist/moments">Rewind Major Moments</DashLink>
            <DashLink href="/artist?tab=forecasts#recommendations">Adaptive Performance</DashLink>
          </div>
        )}
      </SummaryCarousel>

      <TabPills tabs={TABS} value={tab} onChange={pick} variant="dash" className="mt-[22px]" />

      <div className="mt-[22px]">
        {tab === 'Bookings' && (
          <>
            <div className="no-scrollbar flex snap-x gap-[24px] overflow-x-auto px-[8px]">
              {thisWeek.map((b) => (
                <BookingCard key={b.id} p={b} />
              ))}
              {data && thisWeek.length === 0 && (
                <Link href="/artist/sets/new" className="flex h-[146px] w-[264px] shrink-0 items-center justify-center rounded-[22px] border border-dashed border-white/25 font-din text-[13px] font-bold uppercase tracking-wider text-white/75">
                  + Add a new request set
                </Link>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-3 px-[8px]">
              {later.map((b) => (
                <BookingCard key={b.id} p={b} wide />
              ))}
            </div>
          </>
        )}

        {tab === 'Requests' && (
          <div className="flex flex-col gap-3 px-[14px]">
            {micOnly && (
              <p className="flex items-center justify-between px-2 font-din text-[12px] font-bold uppercase tracking-wider text-white/70">
                On The Mic messages
                <Link href="/artist?tab=requests" className="underline">
                  Show all
                </Link>
              </p>
            )}
            {requests.map((r) => (
              <DashRequest key={r.id} r={r} onDecide={decide} />
            ))}
            {data && requests.length === 0 && <EmptyState title="No requests yet" body="When the crowd requests songs at your live or upcoming sets, they show up here." />}
          </div>
        )}

        {tab === 'Analytics' && data && (
          <div className="flex flex-col gap-[9px] px-[8px]">
            <ChartCard title="Trending Sets" venues={data.venues} venueId={venueId} onVenue={setVenueId}>
              <Bars data={data.trendingSets.map((s) => ({ name: new Date(s.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }), value: s.count }))} max={5} />
              <p className="mt-2 truncate font-ui text-[10px] text-white/55">{data.trendingSets.map((s) => s.venue).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</p>
            </ChartCard>
            <ChartCard title="Genre Popularity Distribution" venues={data.venues} venueId={venueId} onVenue={setVenueId}>
              <HBars data={data.genreBars.map((g) => ({ name: g.name, value: g.count }))} />
            </ChartCard>
          </div>
        )}

        {tab === 'Forecasts' && data && (
          <div className="flex flex-col gap-[9px] px-[8px]">
            <ChartCard id="recommendations" defaultOpen={typeof window !== 'undefined' && window.location.hash === '#recommendations'} title="Set Recommendations" venues={data.venues} venueId={venueId} onVenue={setVenueId}>
              {data.recommendations.length ? (
                <ul className="flex flex-col gap-2">
                  {data.recommendations.map((r) => (
                    <li key={r.title + r.artist} className="flex items-center gap-3">
                      {r.artwork ? <img src={r.artwork.replace('600x600', '100x100')} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="h-10 w-10 rounded-lg bg-white/10" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-din text-[13px] font-bold uppercase tracking-wide text-white">{r.title}</span>
                        <span className="block truncate font-ui text-[11.5px] text-white/65">{r.artist}</span>
                      </span>
                      <span className="shrink-0 font-din text-[11px] font-bold text-white/80">{r.count} asks</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Bars data={[]} />
              )}
            </ChartCard>
            <ChartCard title="Fan Base Growth" venues={data.venues} venueId={venueId} onVenue={setVenueId}>
              <Bars data={data.fanGrowth.map((f) => ({ name: f.name, value: f.count }))} max={8} highlightLast />
            </ChartCard>
          </div>
        )}
      </div>
    </Screen>
  );
};

function DashLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <ChipLink
      onClick={() => router.push(href)}
      className="!h-[54px] !rounded-[14px] !pl-[15px] !pr-[10px] !font-ui !text-[11px] !normal-case !tracking-[0.04em]"
    >
      {children}
    </ChipLink>
  );
}

function DashRequest({ r, onDecide }: { r: RequestDTO; onDecide: (r: RequestDTO, a: 'approve' | 'reject') => void }) {
  const mic = r.kind === 'MIC';
  const bg = r.track?.artwork;
  const pending = r.status === 'PENDING';
  return (
    <div className={cx('relative overflow-hidden rounded-[20px] bg-[#1a0505]', pending ? 'h-[124px]' : 'h-[84px]')}>
      {bg && <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 blur-[2px]" loading="lazy" />}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-[#3a0808]/50 to-black/70" />
      <Link href={`/sets/${r.performanceId}`} className="absolute inset-0" aria-label="Open set" />
      <div className="pointer-events-none relative flex h-[84px] flex-col justify-between px-[22px] py-[14px]">
        <div className="flex items-start justify-between gap-3">
          <p className={cx('min-w-0 truncate font-din text-[15px] font-bold tracking-[0.05em] text-white', !mic && 'uppercase')}>{mic ? `“${r.message}”` : r.track?.title}</p>
          <span className="shrink-0 font-din text-[15px] font-bold text-white">{r.track ? duration(r.track.durationSec) : ''}</span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <p className="min-w-0 truncate font-din text-[14px] font-bold tracking-[0.04em] text-white">
            {mic ? 'On The Mic' : r.track?.artist}
            {r.status === 'PLAYING' && <span className="ml-2 rounded-full bg-white px-2 py-0.5 align-middle text-[9px] uppercase text-black">Playing</span>}
          </p>
          <p className="shrink-0 font-num text-[15px] font-light text-white">{rand(r.priceCents / 100)}</p>
        </div>
      </div>
      {pending && (
        <div className="relative flex items-center justify-between gap-2 px-[22px]">
          <span className="rounded-full bg-lime/90 px-2 py-0.5 font-din text-[9px] font-bold uppercase tracking-wider text-lime-ink">New request</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => onDecide(r, 'reject')} className="rounded-full bg-white/15 px-3.5 py-1.5 font-din text-[11px] font-bold uppercase tracking-wider text-white">
              Decline
            </button>
            <button type="button" onClick={() => onDecide(r, 'approve')} className="flex items-center gap-1 rounded-full bg-lime px-3.5 py-1.5 font-din text-[11px] font-bold uppercase tracking-wider text-lime-ink">
              <IconCheck size={12} /> Accept
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

ArtistHome.auth = ['PERFORMER'];
export default ArtistHome;
