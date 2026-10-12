import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import type { AuxedPage } from '../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { EmptyState, TabPills } from '@/components/ui';
import { ArtistSlotCard, BookingCard, ChartCard, RevenueCircle, SummaryCarousel, SummaryTable, SummaryTitle } from '@/components/Dashboard';
import { Bars, HBars, ProfitPie, VolumeLine } from '@/components/Charts';
import { IconCaretDown } from '@/components/Icons';
import { Skeleton } from '@/components/Loader';
import { useApi } from '@/lib/client/useApi';
import { compact, grouped, rand } from '@/lib/format';
import type { OwnerDashboard } from '@/lib/server/services/dashboards';

const TABS = ['Venues', 'Artists', 'Metrics', 'Forecasts'] as const;
type Tab = (typeof TABS)[number];
const CARD_FOR_TAB: Record<Tab, number> = { Venues: 0, Artists: 1, Metrics: 2, Forecasts: 3 };
const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
type Period = (typeof PERIODS)[number];
const STATUS_LABEL: Record<string, string> = { PENDING: 'Pending', QUEUED: 'Queued', PLAYING: 'Playing', PLAYED: 'Played', REJECTED: 'Declined' };

/** The current week is still filling up; leave it off the trend line. */
function fullWeeks<T extends { name: string }>(rows: T[]): T[] {
  const last = rows[rows.length - 1];
  return last && Date.now() - new Date(last.name).getTime() < 7 * 86400_000 ? rows.slice(0, -1) : rows;
}

function volumeLabels(dates: string[]): string[] {
  if (dates.length < 2) return [];
  // Buckets are named by the day their week starts; label by the week's end so 28 Dec counts as Q1.
  const first = new Date(new Date(dates[0]).getTime() + 6 * 86400_000);
  const last = new Date(dates[dates.length - 1]);
  const months = (last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth();
  if (months >= 7) {
    // Every quarter the range touches, in order; four of them spread out when there are more.
    const quarters: string[] = [];
    for (let y = first.getFullYear(), q = Math.floor(first.getMonth() / 3); y < last.getFullYear() || (y === last.getFullYear() && q <= Math.floor(last.getMonth() / 3)); q === 3 ? ((q = 0), y++) : q++) {
      quarters.push(`${y} Q${q + 1}`);
    }
    return quarters.length <= 4 ? quarters : [0, 1, 2, 3].map((i) => quarters[Math.round((i * (quarters.length - 1)) / 3)]);
  }
  const picks = [0, 1, 2, 3].map((i) => new Date(dates[Math.round(((dates.length - 1) * i) / 3)]));
  return picks.map((d) => d.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' }).toUpperCase());
}

const OwnerHome: AuxedPage = () => {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('monthly');
  const [venueId, setVenueId] = useState('');
  const { data } = useApi<OwnerDashboard>(`/api/owner/dashboard?period=${period}${venueId ? `&venueId=${venueId}` : ''}`, { refreshMs: 30_000 });
  const [tab, setTab] = useState<Tab>('Venues');
  const [card, setCard] = useState(0);

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
  const f = data?.financial;
  const s = data?.stats;
  // The next set at each venue leads the Venues tab; everything after it follows full width.
  const lineup = useMemo(() => {
    const seen = new Set<string>();
    const perVenue: OwnerDashboard['upcoming'] = [];
    const later: OwnerDashboard['upcoming'] = [];
    for (const p of data?.upcoming ?? []) {
      if (seen.has(p.venue.id)) later.push(p);
      else {
        seen.add(p.venue.id);
        perVenue.push(p);
      }
    }
    return { perVenue, later: later.slice(0, 6) };
  }, [data?.upcoming]);

  return (
    <Screen nav theme="purple" title="Dashboard">
      <TitleBar title="Dashboard" className="!pb-[18px] !pt-[max(48px,calc(env(safe-area-inset-top)+22px))] [&_h1]:!text-[21px]" />

      <SummaryCarousel index={card} count={5} onChange={setCard}>
        {!data ? (
          <Skeleton className="h-full !rounded-[22px]" />
        ) : card === 0 ? (
          <RevenueCircle cents={data.revenueCents} bold>
            <label className="absolute right-[22px] top-[18px] z-10 flex items-center gap-1 rounded-full bg-[#5a1aa0]/90 px-2.5 py-[5px] font-din text-[9.5px] font-bold capitalize text-white shadow-[0_0_12px_rgba(160,80,240,0.5)]">
              <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="appearance-none bg-transparent capitalize outline-none" aria-label="Revenue period">
                {PERIODS.map((p) => (
                  <option key={p} value={p} className="bg-black capitalize">
                    {p}
                  </option>
                ))}
              </select>
              <IconCaretDown size={9} className="pointer-events-none" />
            </label>
          </RevenueCircle>
        ) : card === 1 ? (
          <SummaryTable
            title="Statistical Summary"
            rows={[
              { label: 'Foot Traffic', value: '' },
              { label: 'LIVE CAPACITY', value: grouped(s!.liveCapacity), red: true, bold: true },
              { label: 'Venue/Festival Capacity', value: grouped(s!.capacity) },
              { label: 'ave/wk', value: grouped(s!.avgWeek), indent: true },
              { label: 'ave/month', value: grouped(s!.avgMonth), indent: true },
              { label: 'Genre Popularity', value: '' },
              { label: '#1 Genre', value: s!.topGenre },
              { label: 'Genre Median', value: s!.medianGenre },
              { label: 'Genre Ave.', value: <span className="whitespace-normal">{s!.aveGenres.join(' / ') || '—'}</span> },
            ]}
          />
        ) : card === 2 ? (
          <div className="flex h-full flex-col px-3 pt-[18px]">
            <SummaryTitle>Request Volume</SummaryTitle>
            <div className="flex flex-1 items-center pr-8">
              <VolumeLine points={fullWeeks(data.volume).map((v) => v.count)} labels={volumeLabels(fullWeeks(data.volume).map((v) => v.name))} />
            </div>
            <svg width="26" height="18" viewBox="0 0 26 18" className="mx-auto mb-3 text-white/60" aria-hidden>
              <path d="m3 3 10 6 10-6M3 10l10 6 10-6" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ) : card === 3 ? (
          <SummaryTable
            title="Financial Summary"
            inset={[42, 46]}
            rows={[
              { label: 'Daily Revenue', value: rand(f!.dailyCents / 100, { symbol: false }) },
              { label: 'Revenue Growth', value: f!.growthPct != null ? `${f!.growthPct}%` : null, bold: true },
              { label: <span className="font-normal">Cash Flow</span>, value: rand(f!.cashFlowCents / 100, { symbol: false }) },
              { label: <span className="font-normal">Profit</span>, value: rand(f!.profitCents / 100, { symbol: false }) },
              { label: 'Retention Rate', value: f!.retentionPct != null ? `${f!.retentionPct}%` : null, bold: true },
              'gap',
              { label: 'Top Song', value: f!.topSong },
              { label: 'Top Request Time', value: f!.topTime },
              { label: 'Top Venue', value: f!.topVenue },
              { label: 'Top Event', value: f!.topEvent },
            ]}
          />
        ) : (
          <div className="flex h-full flex-col px-3 pt-[18px]">
            <SummaryTitle>Genres: Profit Distribution</SummaryTitle>
            <div className="flex flex-1 items-center pr-6">
              <ProfitPie data={data.genreProfit} />
            </div>
          </div>
        )}
      </SummaryCarousel>

      <TabPills tabs={TABS} value={tab} onChange={pick} variant="dash" className="mt-[22px]" />

      <div className="mt-[22px]">
        {tab === 'Venues' && (
          <>
            <div className="no-scrollbar flex snap-x scroll-px-[11px] gap-[26px] overflow-x-auto px-[11px]">
              {lineup.perVenue.map((p) => (
                <BookingCard key={p.id} p={p} variant="owner" />
              ))}
              {data && data.upcoming.length === 0 && (
                <Link href="/owner/bookings/new" className="flex h-[156px] w-[280px] shrink-0 items-center justify-center rounded-[16px] border border-dashed border-white/25 font-din text-[13px] font-bold uppercase tracking-wider text-white/75">
                  + Book an artist
                </Link>
              )}
            </div>
            {lineup.later.length > 0 && (
              <div className="mt-[9px] flex flex-col gap-[9px] px-[8px]">
                {lineup.later.map((p) => (
                  <BookingCard key={p.id} p={p} variant="owner" wide />
                ))}
              </div>
            )}
            <div className="mt-6 px-[16px]">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="font-din text-[14px] font-bold uppercase tracking-[0.1em] text-white/75">My Venues</h2>
                <span className="flex gap-4">
                  <Link href="/owner/aux-in" className="font-din text-[12px] font-bold uppercase tracking-wider text-lime">
                    🎧 AUX IN
                  </Link>
                  <Link href="/owner/venues/new" className="font-din text-[12px] font-bold uppercase tracking-wider text-[#d6a7ff]">
                    + Register
                  </Link>
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {data?.venues.map((v) => (
                  <Link key={v.id} href={`/owner/venues/${v.id}`} className="panel flex items-center justify-between px-4 py-3">
                    <span>
                      <span className="block font-din text-[14px] font-bold uppercase tracking-wide text-white">{v.name}</span>
                      <span className="block font-ui text-[12px] text-white/55">
                        {v.city} · {grouped(v.liveCapacity)} / {grouped(v.capacity)} in now · artist share {v.artistSharePct}%
                      </span>
                    </span>
                    <span className="font-din text-[11px] font-bold uppercase text-white/60">Edit ›</span>
                  </Link>
                ))}
                {data && data.venues.length === 0 && <EmptyState title="No venues yet" body="Register your venue to start receiving requests and see revenue here." />}
              </div>
            </div>
          </>
        )}

        {tab === 'Artists' && (
          <div className="flex flex-col px-[10px] pb-4">
            {data?.artists.map((p) => (
              <ArtistSlotCard key={p.id} p={p} />
            ))}
            {data && data.artists.length === 0 && <EmptyState title="No artists booked" body="Book artists for your venues and their slots show up here." action={<Link href="/owner/bookings/new" className="rounded-full bg-lime px-5 py-2.5 font-din text-[13px] font-bold uppercase text-lime-ink">Book an artist</Link>} />}
          </div>
        )}

        {tab === 'Metrics' && data && (
          <div className="flex flex-col gap-[9px] px-[8px]">
            <ChartCard title="Request System" venues={data.venues} venueId={venueId} onVenue={setVenueId}>
              <Bars data={data.requestSystem.map((r) => ({ name: STATUS_LABEL[r.name] ?? r.name, value: r.count }))} />
            </ChartCard>
            <ChartCard title="Genre Distributions" venues={data.venues} venueId={venueId} onVenue={setVenueId}>
              <HBars data={data.genreBars.map((g) => ({ name: g.name, value: g.count }))} />
            </ChartCard>
          </div>
        )}

        {tab === 'Forecasts' && data && (
          <div className="flex flex-col gap-[9px] px-[8px]">
            <ChartCard title="Revenue Projection" venues={data.venues} venueId={venueId} onVenue={setVenueId}>
              <Bars
                data={[...data.projection.filter((p) => !p.projected).slice(-4), ...data.projection.filter((p) => p.projected).slice(0, 4)].map((p) => ({ name: new Date(p.name).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }), value: p.cents / 100, dim: p.projected }))}
                format={(n) => `R${compact(n)}`}
                max={8}
              />
              <p className="mt-2 font-ui text-[10px] text-white/50">Solid bars are recent weeks; faded bars are projected from your trend.</p>
            </ChartCard>
            <ChartCard title="Revenue Mapping" venues={data.venues} venueId={venueId} onVenue={setVenueId}>
              <HBars data={data.mapping.map((m) => ({ name: m.name, value: m.count / 100 }))} format={(n) => `R${compact(n)}`} />
            </ChartCard>
          </div>
        )}
      </div>
    </Screen>
  );
};

OwnerHome.auth = ['OWNER'];
export default OwnerHome;
