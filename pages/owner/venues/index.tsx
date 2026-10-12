/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { AuxedPage } from '../../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { EmptyState } from '@/components/ui';
import { VenueLogo } from '@/components/VenueLogo';
import { Skeleton } from '@/components/Loader';
import { useApi } from '@/lib/client/useApi';
import { grouped } from '@/lib/format';
import type { VenueDTO } from '@/lib/types';

/** Your registered venues. */
const MyVenues: AuxedPage = () => {
  const { data } = useApi<{ venues: VenueDTO[] }>('/api/owner/venues');
  return (
    <Screen nav theme="purple" title="My Venues">
      <TitleBar
        title="My Venues"
        back="/owner"
        right={
          <Link href="/owner/venues/new" className="rounded-full bg-lime px-3 py-1.5 font-din text-[11px] font-bold uppercase text-lime-ink">
            + Register
          </Link>
        }
      />
      <div className="flex flex-col gap-4 px-4">
        {!data && [0, 1].map((i) => <Skeleton key={i} className="h-[180px]" />)}
        {data?.venues.map((v) => (
          <Link key={v.id} href={`/owner/venues/${v.id}`} className="relative block h-[180px] overflow-hidden rounded-[24px] bg-black/40">
            {v.imageUrl && <img src={v.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/85" />
            <div className="absolute bottom-4 left-4 right-4">
              <VenueLogo name={v.name} style={v.logoStyle} size="sm" />
              <p className="mt-1 font-ui text-[12px] text-white/75">
                {v.city} · capacity {grouped(v.capacity)} · artist share {v.artistSharePct}%
              </p>
            </div>
          </Link>
        ))}
        {data && data.venues.length === 0 && <EmptyState title="No venues yet" body="Register your establishment so artists can connect and AUXees can request." />}
      </div>
    </Screen>
  );
};

MyVenues.auth = ['OWNER'];
export default MyVenues;
