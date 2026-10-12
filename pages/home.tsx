import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import type { AuxedPage } from './_app';
import { Screen } from '@/components/Screen';
import { ChipLink, Sheet } from '@/components/ui';
import { ClubCard, FestieCard, RequestTicket } from '@/components/Cards';
import { IconCamera, IconHelp, IconNote, IconPlus } from '@/components/Icons';
import { TopUpSheet } from '@/components/TopUpSheet';
import { Skeleton } from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { useSession } from '@/lib/client/session';
import { rand } from '@/lib/format';
import type { EventDTO, PerformanceBrief, TicketDTO } from '@/lib/types';

interface HomeData {
  festies: EventDTO[];
  clubs: PerformanceBrief[];
  tickets: TicketDTO[];
}

const Home: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const { user, refresh } = useSession();
  const { data } = useApi<HomeData>('/api/home', { refreshMs: 30_000 });
  const [help, setHelp] = useState(false);
  const [topUp, setTopUp] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function shareTunes() {
    const url = window.location.origin;
    const text = 'Join me on AUXED — request the next song and shape the set.';
    try {
      if (navigator.share) await navigator.share({ title: 'AUXED', text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast('Invite link copied.', 'success');
      }
    } catch {
      /* share sheet dismissed */
    }
  }

  return (
    <Screen nav theme="blue" title="Home">
      <div className="relative px-[24px] pt-[max(70px,calc(env(safe-area-inset-top)+44px))]">
        <button type="button" onClick={() => setHelp(true)} aria-label="How AUXED works" className="absolute right-[42px] top-[max(64px,calc(env(safe-area-inset-top)+38px))] text-[#3f55dc]">
          <IconHelp size={26} />
        </button>

        <div className="mt-[32px] flex gap-4">
          {/* Request tickets */}
          <div className="w-[150px] shrink-0">
            <h1 className="narrow-x font-din text-[36px] font-semibold uppercase leading-[1.1] tracking-[0.04em] text-white glow-text" style={{ fontStretch: '85%' }}>
              Request
              <br />
              Tickets
            </h1>
            <div className="mt-5 flex gap-[18px]">
              <RoundAction label={'Quick\nRequest'} onClick={() => router.push('/request')}>
                <IconNote size={30} className="text-[#7d95ff]" />
              </RoundAction>
              <RoundAction label={'Capture\nThe Moment'} onClick={() => router.push('/snippet')}>
                <IconCamera size={28} className="text-[#7d95ff]" />
              </RoundAction>
            </div>
          </div>
          <div className="no-scrollbar -mr-[24px] flex min-w-0 flex-1 gap-2 overflow-x-auto pb-2 pr-[24px] pt-3">
            {data?.tickets.length ? (
              data.tickets.map((t) => <RequestTicket key={t.performanceId} t={t} />)
            ) : data ? (
              <Link href="/request" className="flex h-[170px] w-[236px] shrink-0 flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed border-white/25 bg-white/[0.04] px-6 text-center">
                <IconNote size={26} className="text-white/60" />
                <span className="font-din text-[12px] font-bold uppercase tracking-[0.14em] text-white/80">Your request tickets land here</span>
              </Link>
            ) : (
              <Skeleton className="h-[170px] w-[236px] shrink-0" />
            )}
          </div>
        </div>

        {/* Wallet + quick links */}
        <div className="mt-[30px] flex items-center">
          <button type="button" onClick={() => setTopUp(true)} className="min-w-0 flex-1 text-left" aria-label="Top up token wallet">
            <p className="whitespace-nowrap font-din text-[18px] font-normal uppercase tracking-[0.05em] text-white/90">Token Wallet</p>
            <WalletAmount cents={user?.walletCents ?? 0} />
          </button>
          <div className="mx-[10px] h-[112px] w-[6px] shrink-0 rounded-full bg-white/75" />
          <div className="grid w-[188px] shrink-0 grid-cols-2 gap-x-[6px] gap-y-[9px]">
            <ChipLink size="sm" onClick={() => router.push('/wire')}>Wire Room</ChipLink>
            <ChipLink size="sm" onClick={() => router.push('/treasure')}>My Treasure Box</ChipLink>
            <ChipLink size="sm" onClick={() => router.push('/search?layer=friends')}>My Hotspots</ChipLink>
            <ChipLink size="sm" onClick={shareTunes}>Share Tunes</ChipLink>
            <ChipLink size="sm" onClick={() => router.push('/vibes')}>Stream The Vibe</ChipLink>
            <ChipLink size="sm" onClick={() => router.push('/friends')} icon={<IconPlus size={12} className="text-white/60" />}>
              Add A Friend
            </ChipLink>
          </div>
        </div>
      </div>

      {/* At the Festie */}
      <section className="relative mt-[44px]">
        <div className="pointer-events-none absolute inset-x-0 top-[6px] h-[200px] bg-gradient-to-b from-[#2b3fb6]/60 via-[#2236a6]/40 to-transparent" aria-hidden />
        <h2 className="pointer-events-none absolute left-1/2 top-[-22px] z-10 -translate-x-1/2 whitespace-nowrap text-center font-bubble text-[34px] leading-[0.82] text-white glow-text" style={{ WebkitTextStroke: '1px rgba(255,255,255,0.4)' }}>
          AT THE
          <br />
          FESTIE
        </h2>
        <div className="no-scrollbar relative flex snap-x gap-[10px] overflow-x-auto px-[4px] pt-[14px]">
          {data ? data.festies.map((e) => <div key={e.id} className="snap-start"><FestieCard e={e} /></div>) : [0, 1].map((i) => <Skeleton key={i} className="h-[178px] w-[232px] shrink-0" />)}
          {data && data.festies.length === 0 && <p className="py-16 font-ui text-sm text-white/60">No festivals on the radar yet.</p>}
        </div>
      </section>

      {/* In da club */}
      <section className="relative mt-[26px]">
        <h2 className="pointer-events-none relative z-10 text-center font-serif text-[40px] leading-[0.74] text-white glow-text">
          IN DA
          <br />
          CLUB
        </h2>
        <div className="no-scrollbar -mt-3 flex snap-x gap-[10px] overflow-x-auto px-[4px] pb-4">
          {data ? data.clubs.map((p, i) => <div key={p.id} className="snap-start"><ClubCard p={p} narrow={i % 2 === 1} /></div>) : [0, 1].map((i) => <Skeleton key={i} className="h-[196px] w-[232px] shrink-0" />)}
          {data && data.clubs.length === 0 && <p className="py-16 font-ui text-sm text-white/60">No club sets tonight yet.</p>}
        </div>
      </section>

      <Sheet open={help} onClose={() => setHelp(false)} title="How AUXED works">
        <ol className="space-y-3 pb-2 font-ui text-[14px] leading-relaxed text-white/85">
          <li>
            <b>1. Top up your token wallet</b> with a card. Tokens are in-app credit (R1 = 1 token).
          </li>
          <li>
            <b>2. Find a live set</b> at a club or festival stage — or scan in when you arrive.
          </li>
          <li>
            <b>3. Request a song or go On The Mic.</b> The artist sets the price per minute. If they decline, your tokens go straight back to your wallet.
          </li>
          <li>
            <b>4. Upvote and react</b> to push the crowd&apos;s favourites up the queue.
          </li>
          <li>
            <b>5. Keep the ticket.</b> Every set you shaped is saved as a request ticket.
          </li>
        </ol>
      </Sheet>
      <TopUpSheet open={topUp} onClose={() => setTopUp(false)} />
    </Screen>
  );
};

function WalletAmount({ cents }: { cents: number }) {
  const text = rand(cents / 100);
  const size = text.length <= 6 ? 40 : text.length <= 8 ? 32 : text.length <= 10 ? 26 : 22;
  return (
    <p className="whitespace-nowrap font-din font-bold leading-tight tracking-[0.02em] text-white glow-text-soft" style={{ fontSize: size }}>
      {text}
    </p>
  );
}

function RoundAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-2">
      <span
        className="flex h-[56px] w-[56px] items-center justify-center rounded-full"
        style={{ background: 'radial-gradient(circle at 50% 35%, #2741c4, #142a94 70%)', boxShadow: '0 0 20px rgba(80,110,255,0.7), inset 0 0 0 2px rgba(130,150,255,0.35)' }}
      >
        {children}
      </span>
      <span className="whitespace-pre-line text-center font-din text-[8.5px] font-bold uppercase leading-[1.25] tracking-[0.12em] text-white">{label}</span>
    </button>
  );
}

Home.auth = true;
export default Home;
