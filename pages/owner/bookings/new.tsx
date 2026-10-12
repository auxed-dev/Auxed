/* eslint-disable @next/next/no-img-element */
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import type { AuxedPage } from '../../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { IconSearch } from '@/components/Icons';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { api, post, errorMessage } from '@/lib/client/api';
import { cx } from '@/lib/util';
import type { VenueDTO } from '@/lib/types';

interface PerformerHit {
  id: string;
  name: string;
  imageUrl: string | null;
  genres: string[];
  type: 'DJ' | 'ARTIST';
}
interface OwnerEvent {
  id: string;
  title: string;
  venueId: string | null;
  stages: { id: string; name: string }[];
}

function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Book an artist into a slot at one of your venues (optionally on an event stage). */
const NewBooking: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const { data: venues } = useApi<{ venues: VenueDTO[] }>('/api/owner/venues');
  const { data: evs } = useApi<{ events: OwnerEvent[] }>('/api/owner/events');
  const [venueId, setVenueId] = useState('');
  const [stageId, setStageId] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PerformerHit[]>([]);
  const [artist, setArtist] = useState<PerformerHit | null>(null);
  const start = new Date();
  start.setDate(start.getDate() + ((5 - start.getDay() + 7) % 7 || 7));
  start.setHours(22, 0, 0, 0);
  const [startsAt, setStartsAt] = useState(localInput(start));
  const [endsAt, setEndsAt] = useState(localInput(new Date(start.getTime() + 2 * 3600_000)));
  const [basis, setBasis] = useState<'Once off' | 'Recurring'>('Once off');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!venueId && venues?.venues[0]) setVenueId(venues.venues[0].id);
  }, [venues, venueId]);
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ performers: PerformerHit[] }>(`/api/performers/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setHits(r.performers))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const stages = (evs?.events ?? []).filter((e) => !e.venueId || e.venueId === venueId).flatMap((e) => e.stages.map((s) => ({ ...s, event: e.title })));

  async function submit() {
    if (!artist || !venueId) return;
    setBusy(true);
    try {
      await post('/api/owner/bookings', {
        venueId,
        performerId: artist.id,
        stageId: stageId || undefined,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        basis,
      });
      toast(`${artist.name} is booked.`, 'success');
      router.replace('/owner?tab=artists');
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  }

  return (
    <Screen nav theme="purple" title="Book an artist">
      <TitleBar title="Book An Artist" back="/owner" />
      <section className="glow-card mx-[10px] flex flex-col gap-4 px-5 pb-8 pt-6">
        <div>
          <label className="label">Venue</label>
          <select className="field appearance-none" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            {venues?.venues.map((v) => (
              <option key={v.id} value={v.id} className="bg-black">
                {v.name}
              </option>
            ))}
          </select>
          {venues && venues.venues.length === 0 && <p className="mt-2 font-ui text-[12px] text-white/60">Register a venue first.</p>}
        </div>
        {stages.length > 0 && (
          <div>
            <label className="label">Event stage (optional)</label>
            <select className="field appearance-none" value={stageId} onChange={(e) => setStageId(e.target.value)}>
              <option value="" className="bg-black">
                No stage — a regular night
              </option>
              {stages.map((s) => (
                <option key={s.id} value={s.id} className="bg-black">
                  {s.event} · {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label">Artist</label>
          {artist ? (
            <div className="flex items-center gap-3 rounded-2xl bg-black/40 p-2 pr-4">
              {artist.imageUrl ? <img src={artist.imageUrl} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="h-12 w-12 rounded-full bg-white/10" />}
              <span className="flex-1">
                <span className="block font-ui text-[15px] font-semibold text-white">{artist.name}</span>
                <span className="block font-ui text-[12px] text-white/60">{artist.genres.slice(0, 3).join(' · ') || artist.type}</span>
              </span>
              <button type="button" onClick={() => setArtist(null)} className="font-ui text-[12px] text-white/70 underline">
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <IconSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50" />
                <input className="field pl-11" placeholder="Search artists on AUXED" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="mt-2 flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
                {hits.map((h) => (
                  <button key={h.id} type="button" onClick={() => setArtist(h)} className="flex items-center gap-3 rounded-2xl bg-black/30 p-2 text-left">
                    {h.imageUrl ? <img src={h.imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="h-10 w-10 rounded-full bg-white/10" />}
                    <span>
                      <span className="block font-ui text-[14px] font-semibold text-white">{h.name}</span>
                      <span className="block font-ui text-[12px] text-white/55">{h.genres.slice(0, 3).join(' · ') || h.type}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Starts</label>
            <input type="datetime-local" className="field px-3 text-[13px]" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <label className="label">Ends</label>
            <input type="datetime-local" className="field px-3 text-[13px]" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-full bg-black/40 p-1">
          {(['Once off', 'Recurring'] as const).map((b) => (
            <button key={b} type="button" onClick={() => setBasis(b)} className={cx('rounded-full py-2.5 font-din text-[13px] font-bold uppercase tracking-wider', basis === b ? 'bg-lime text-lime-ink' : 'text-white/70')}>
              {b}
            </button>
          ))}
        </div>
        <button type="button" disabled={busy || !artist || !venueId} onClick={submit} className="glass-pill mt-2 h-[60px] w-full text-[15px] disabled:opacity-50">
          {busy ? 'Booking…' : 'Book Artist'}
        </button>
      </section>
    </Screen>
  );
};

NewBooking.auth = ['OWNER'];
export default NewBooking;
