/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { AuxedPage } from './_app';
import { Screen, TitleBar } from '@/components/Screen';
import { EmptyState } from '@/components/ui';
import { IconNote } from '@/components/Icons';
import { Skeleton } from '@/components/Loader';
import { useApi } from '@/lib/client/useApi';
import type { MapVenue } from '@/components/MapView';

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Quick Request: live sets, nearest first. */
const QuickRequest: AuxedPage = () => {
  const { data } = useApi<{ venues: MapVenue[] }>('/api/map', { refreshMs: 30_000 });
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition((p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }), () => undefined, { maximumAge: 300_000, timeout: 8000 });
  }, []);

  const live = useMemo(() => {
    const rows = (data?.venues ?? []).flatMap((v) => v.live.map((l) => ({ v, l, d: here ? km(here, v) : null })));
    rows.sort((a, b) => (a.d ?? 0) - (b.d ?? 0) || b.v.liveCapacity - a.v.liveCapacity);
    return rows;
  }, [data, here]);

  return (
    <Screen nav title="Quick Request">
      <TitleBar title="Quick Request" back />
      <p className="-mt-2 mb-4 px-7 font-ui text-[13px] text-white/60">{here ? 'Live sets near you' : 'Live sets right now'} — tap one to request a song.</p>
      <div className="flex flex-col gap-3 px-4">
        {!data && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[96px]" />)}
        {live.map(({ v, l, d }) => (
          <Link key={l.id} href={`/sets/${l.id}?request=1`} className="relative flex h-[96px] items-center gap-4 overflow-hidden rounded-[22px] bg-black/40 px-4">
            {v.imageUrl && <img src={v.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" loading="lazy" />}
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 to-black/30" />
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full round-glass">
              <IconNote size={20} />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block truncate font-din text-[16px] font-bold uppercase tracking-wide text-white">{v.name}</span>
              <span className="block truncate font-ui text-[12.5px] text-white/75">
                {l.performer}
                {l.nowPlaying ? ` · ♪ ${l.nowPlaying}` : ''}
              </span>
            </span>
            <span className="relative shrink-0 text-right font-din text-[11px] font-bold uppercase text-white/80">
              <span className="flex items-center justify-end gap-1 text-red-300">
                <span className="h-2 w-2 animate-pulseGlow rounded-full bg-red-500" /> Live
              </span>
              {d !== null && <span className="block text-white/60">{d < 1 ? `${Math.round(d * 1000)} m` : `${d < 100 ? d.toFixed(1) : Math.round(d)} km`}</span>}
            </span>
          </Link>
        ))}
        {data && live.length === 0 && <EmptyState title="Nothing live right now" body="When an artist goes live at a venue, it shows up here." />}
      </div>
    </Screen>
  );
};

QuickRequest.auth = true;
export default QuickRequest;
