/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { Screen, TitleBar } from '@/components/Screen';
import { ErrorNote } from '@/components/ui';
import { VenueLogo } from '@/components/VenueLogo';
import { Loader } from '@/components/Loader';
import { useApi } from '@/lib/client/useApi';
import { post } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import { grouped } from '@/lib/format';
import type { VenueDTO } from '@/lib/types';

/** Venue link (e.g. from a QR code at the door): opens the live / next set, or the venue card. */
export default function VenuePage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const { data, error, reload } = useApi<{ venue: VenueDTO; performanceId: string | null }>(id ? `/api/venues/${id}` : null);

  const { user } = useSession();
  // Opening the door QR link checks you in for a few hours (unlocks on-site features like AUX IN).
  useEffect(() => {
    if (id && user) post(`/api/venues/${id}/checkin`).catch(() => undefined);
  }, [id, user]);

  useEffect(() => {
    if (data?.performanceId && router.query.info !== '1') router.replace(`/sets/${data.performanceId}`);
  }, [data, router]);

  if (error && !data)
    return (
      <Screen nav title="Venue">
        <div className="pt-24">
          <ErrorNote message={error.message} onRetry={reload} />
        </div>
      </Screen>
    );
  if (!data || (data.performanceId && router.query.info !== '1')) return <Loader />;
  const v = data.venue;

  return (
    <Screen nav title={v.name}>
      <TitleBar title="Venue" back />
      <div className="mx-[18px] overflow-hidden rounded-[28px] bg-black/40">
        <div className="relative h-[240px]">
          {v.imageUrl && <img src={v.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/85" />
          <div className="absolute bottom-4 left-4 right-4">
            <VenueLogo name={v.name} style={v.logoStyle} size="md" />
            <p className="mt-1 font-ui text-[13px] text-white/80">
              {v.address ? `${v.address}, ` : ''}
              {v.city}
            </p>
          </div>
        </div>
        <div className="space-y-3 p-5 font-ui text-[14px] text-white/85">
          {v.description && <p>{v.description}</p>}
          <p className="text-white/60">Capacity {grouped(v.capacity)}</p>
          <p className="rounded-2xl bg-white/[0.06] px-4 py-3 text-white/75">No sets are scheduled here right now. Follow the Wire Room for announcements.</p>
          <div className="flex gap-2">
            <Link href={`/search?venue=${v.id}`} className="flex-1 rounded-full bg-white/10 py-3 text-center font-din text-[13px] font-bold uppercase tracking-wider text-white">
              Show on map
            </Link>
            {data.performanceId && (
              <Link href={`/sets/${data.performanceId}`} className="flex-1 rounded-full bg-lime py-3 text-center font-din text-[13px] font-bold uppercase tracking-wider text-lime-ink">
                Open set
              </Link>
            )}
          </div>
        </div>
      </div>
    </Screen>
  );
}
