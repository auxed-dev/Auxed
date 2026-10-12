/* eslint-disable @next/next/no-img-element */
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Screen } from '@/components/Screen';
import { IconSearch, IconSos, IconUsers, IconX } from '@/components/Icons';
import { Sheet, Toggle } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { api, patch, errorMessage } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import type { FriendDTO, PerformanceBrief, VenueDTO } from '@/lib/types';
import type { MapEvent, MapVenue } from '@/components/MapView';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false, loading: () => <div className="absolute inset-0 bg-[#1b1b1d]" /> });

interface MapData {
  venues: MapVenue[];
  events: MapEvent[];
  friends: FriendDTO[];
}
interface SearchResult {
  venues: VenueDTO[];
  events: { id: string; title: string; location: string; imageUrl: string | null; startsAt: string }[];
  performers: { id: string; name: string; imageUrl: string | null; genres: string[]; set: PerformanceBrief | null }[];
}

/** "Where's the vibe tonight?" — live venues, crowd heat, wait times and friends on the map. */
export default function SearchPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, refresh } = useSession();
  const { data, reload } = useApi<MapData>('/api/map', { refreshMs: 30_000 });
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [picked, setPicked] = useState<MapVenue | null>(null);
  const [locSheet, setLocSheet] = useState(false);
  const [sos, setSos] = useState(false);
  const centered = useRef(false);
  const fitFriends = router.query.layer === 'friends';

  useEffect(() => {
    if (!data || !router.isReady || centered.current) return;
    centered.current = true;
    const vid = typeof router.query.venue === 'string' ? router.query.venue : null;
    const v = vid ? data.venues.find((x) => x.id === vid) : null;
    if (v) {
      setFocus({ lat: v.lat, lng: v.lng, zoom: 15 });
      setPicked(v);
      return;
    }
    if (fitFriends) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setMe(here);
          setFocus({ ...here, zoom: 12 });
        },
        () => undefined,
        { maximumAge: 300_000, timeout: 8000 },
      );
    }
  }, [data, router.isReady, router.query.venue, fitFriends]);

  function recenter() {
    if (!navigator.geolocation) return toast('Location is not available on this device.', 'error');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(here);
        setFocus({ ...here, zoom: 15 });
      },
      () => toast('Allow location access to find where you are.', 'error'),
      { maximumAge: 60_000, timeout: 10_000 },
    );
  }

  /** Nearest venue with a security number within ~400 m of you. */
  const nearbySecurity = useMemo(() => {
    if (!me || !data) return null;
    let best: MapVenue | null = null;
    let bestD = 0.4;
    for (const v of data.venues) {
      if (!v.safetyPhone) continue;
      const d = Math.hypot((v.lat - me.lat) * 111, (v.lng - me.lng) * 111 * Math.cos((me.lat * Math.PI) / 180));
      if (d < bestD) {
        best = v;
        bestD = d;
      }
    }
    return best;
  }, [me, data]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      api<SearchResult>(`/api/search?q=${encodeURIComponent(term)}`)
        .then(setResults)
        .catch(() => setResults(null));
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  const hasResults = useMemo(() => !!results && (results.venues.length || results.events.length || results.performers.length), [results]);

  async function setSharing(share: boolean) {
    if (!user) return router.push('/login?next=/search');
    try {
      if (share) {
        const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10_000 }));
        await patch('/api/me/location', { share: true, lat: pos.coords.latitude, lng: pos.coords.longitude });
        setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast('Your friends can see you on the map.', 'success');
      } else {
        await patch('/api/me/location', { share: false });
        toast('Location sharing is off.', 'success');
      }
      await refresh();
      reload();
    } catch (err) {
      toast(err instanceof GeolocationPositionError ? 'Allow location access to share where you are.' : errorMessage(err), 'error');
    }
  }

  return (
    <Screen nav title="Search" className="!pb-0">
      <div className="fixed inset-0 mx-auto max-w-[var(--app-w)]">
        {data && (
          <MapView
            venues={data.venues}
            events={data.events}
            friends={data.friends}
            focus={focus}
            fitFriends={fitFriends}
            me={me}
            onVenue={(v) => setPicked(v)}
            onEvent={(e) => router.push(`/events/${e.id}`)}
          />
        )}
      </div>

      {/* Search */}
      <div className="fixed inset-x-0 top-0 z-20 mx-auto max-w-[var(--app-w)] px-[44px] pt-[max(56px,calc(env(safe-area-inset-top)+30px))]">
        <div className="relative">
          <IconSearch size={18} className="pointer-events-none absolute left-5 top-1/2 z-10 -translate-y-1/2 text-white" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Where’s the vibe tonight?"
            aria-label="Search venues, events and artists"
            className="h-[40px] w-full rounded-[14px] border-0 bg-white/25 pl-12 pr-10 font-ui text-[15px] font-medium text-white outline-none backdrop-blur-md placeholder:text-white/85"
          />
          {q && (
            <button type="button" aria-label="Clear" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80">
              <IconX size={16} />
            </button>
          )}
        </div>
        {results && (
          <div className="mt-2 max-h-[52dvh] overflow-y-auto rounded-[20px] bg-black/85 p-2 backdrop-blur-xl">
            {!hasResults && <p className="p-4 text-center font-ui text-[13px] text-white/60">Nothing found for “{q}”.</p>}
            {results.venues.map((v) => (
              <ResultRow
                key={v.id}
                img={v.imageUrl}
                title={v.name}
                sub={`Venue · ${v.city}`}
                onClick={() => {
                  setFocus({ lat: v.lat, lng: v.lng, zoom: 15 });
                  setQ('');
                  const mv = data?.venues.find((x) => x.id === v.id);
                  if (mv) setPicked(mv);
                }}
              />
            ))}
            {results.events.map((e) => (
              <ResultRow key={e.id} img={e.imageUrl} title={e.title} sub={`Event · ${e.location}`} onClick={() => router.push(`/events/${e.id}`)} />
            ))}
            {results.performers.map((p) => (
              <ResultRow
                key={p.id}
                img={p.imageUrl}
                title={p.name}
                sub={p.set ? `${p.set.status === 'LIVE' ? 'Live now' : 'Next'} at ${p.set.venue.name}` : `Artist · ${p.genres.slice(0, 2).join(', ')}`}
                onClick={() => (p.set ? router.push(`/sets/${p.set.id}`) : toast(`${p.name} has no upcoming sets.`))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Map actions: SOS, re-centre on me, friends & location sharing */}
      <div className="fixed bottom-[112px] right-[max(16px,calc(50vw-204px))] z-20 flex flex-col items-center gap-3">
        <button type="button" aria-label="SOS — get help" onClick={() => setSos(true)} className="drop-shadow-[0_0_12px_rgba(229,72,77,0.75)] transition active:scale-95">
          <IconSos size={48} />
        </button>
        <button type="button" aria-label="Re-centre on my location" onClick={recenter} className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="2.2" />
            <circle cx="12" cy="12" r="2.4" fill="currentColor" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" aria-label="Friends & location sharing" onClick={() => setLocSheet(true)} className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur">
          <IconUsers size={22} />
        </button>
      </div>

      <Sheet open={sos} onClose={() => setSos(false)} title="Feeling unsafe?">
        <p className="mb-4 text-center font-ui text-[13px] text-white/70">Don&apos;t let it ruin your night — call for help.</p>
        <div className="flex flex-col gap-2 pb-2">
          {nearbySecurity && (
            <a href={`tel:${nearbySecurity.safetyPhone}`} className="rounded-2xl bg-red-600 px-5 py-4 text-center font-din text-[15px] font-bold uppercase tracking-wider text-white">
              Call {nearbySecurity.name} security
            </a>
          )}
          <a href="tel:112" className="rounded-2xl bg-red-600/90 px-5 py-4 text-center font-din text-[15px] font-bold uppercase tracking-wider text-white">
            Emergency · 112
          </a>
          <a href="tel:10111" className="rounded-2xl bg-white/10 px-5 py-4 text-center font-din text-[15px] font-bold uppercase tracking-wider text-white">
            Police · 10111
          </a>
          <button
            type="button"
            onClick={() => {
              setSos(false);
              setLocSheet(true);
            }}
            className="rounded-2xl bg-white/10 px-5 py-4 text-center font-din text-[15px] font-bold uppercase tracking-wider text-white"
          >
            Share my location with friends
          </button>
        </div>
      </Sheet>

      <Sheet open={!!picked} onClose={() => setPicked(null)} title={picked?.name}>
        {picked && (
          <div className="pb-2">
            <p className="text-center font-ui text-[13px] text-white/70">
              {picked.address ? `${picked.address}, ` : ''}
              {picked.city}
              {picked.waitMinutes != null && ` · ${picked.waitMinutes >= 60 ? `${Math.round(picked.waitMinutes / 6) / 10} hrs` : `${picked.waitMinutes} min`} wait`}
            </p>
            {picked.live.length ? (
              <div className="mt-4 space-y-2">
                {picked.live.map((l) => (
                  <button key={l.id} type="button" onClick={() => router.push(`/sets/${l.id}`)} className="flex w-full items-center justify-between rounded-2xl bg-white/[0.08] px-4 py-3 text-left">
                    <span>
                      <span className="block font-din text-[14px] font-bold uppercase tracking-wide text-white">{l.performer}</span>
                      <span className="block font-ui text-[12px] text-white/65">{l.nowPlaying ? `Playing: ${l.nowPlaying}` : l.title}</span>
                    </span>
                    <span className="flex items-center gap-1.5 font-din text-[11px] font-bold uppercase text-red-300">
                      <span className="h-2 w-2 animate-pulseGlow rounded-full bg-red-500" /> Live
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-white/[0.06] px-4 py-3 text-center font-ui text-[13px] text-white/70">Nothing live here right now.</p>
            )}
            <button type="button" onClick={() => router.push(`/venues/${picked.id}?info=1`)} className="mt-3 w-full rounded-full bg-white/10 py-3 font-din text-[13px] font-bold uppercase tracking-wider text-white">
              Venue details
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={locSheet} onClose={() => setLocSheet(false)} title="My Hotspots">
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.07] px-4 py-4">
          <div>
            <p className="font-ui text-[15px] font-semibold text-white">Share my location</p>
            <p className="font-ui text-[12px] text-white/60">Only friends you&apos;ve accepted can see you. Turn it off any time.</p>
          </div>
          <Toggle checked={!!user?.shareLocation} onChange={setSharing} label="Share my location" />
        </div>
        <div className="mt-4 space-y-2">
          {(data?.friends ?? []).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                if (f.lat !== null && f.lng !== null) setFocus({ lat: f.lat, lng: f.lng, zoom: 16 });
                setLocSheet(false);
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-2.5 text-left"
            >
              {f.avatarUrl ? <img src={f.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="h-9 w-9 rounded-full bg-white/15" />}
              <span className="flex-1">
                <span className="block font-ui text-[14px] font-semibold text-white">{f.userName}</span>
                {f.statusText && <span className="block font-ui text-[12px] text-white/60">{f.statusText}</span>}
              </span>
            </button>
          ))}
          {data && data.friends.length === 0 && <p className="py-3 text-center font-ui text-[13px] text-white/60">No friends are sharing their location right now.</p>}
        </div>
        <button type="button" onClick={() => router.push('/friends')} className="mt-4 w-full rounded-full bg-white/10 py-3 font-din text-[13px] font-bold uppercase tracking-wider text-white">
          Manage friends
        </button>
      </Sheet>
    </Screen>
  );
}

function ResultRow({ img, title, sub, onClick }: { img: string | null; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-white/10">
      {img ? <img src={img} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <span className="h-10 w-10 rounded-xl bg-white/10" />}
      <span className="min-w-0">
        <span className="block truncate font-ui text-[14px] font-semibold text-white">{title}</span>
        <span className="block truncate font-ui text-[12px] text-white/60">{sub}</span>
      </span>
    </button>
  );
}
