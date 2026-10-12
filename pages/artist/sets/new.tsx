/* eslint-disable @next/next/no-img-element */
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import type { AuxedPage } from '../../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { IconSearch } from '@/components/Icons';
import { useToast } from '@/components/Toast';
import { api, post, errorMessage } from '@/lib/client/api';
import { cx } from '@/lib/util';
import type { VenueDTO } from '@/lib/types';

function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Add a new request set / Connect to venue (go live now). */
const NewSet: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const [live, setLive] = useState(false);
  const [q, setQ] = useState('');
  const [venues, setVenues] = useState<VenueDTO[]>([]);
  const [venue, setVenue] = useState<VenueDTO | null>(null);
  const [title, setTitle] = useState('');
  const start = new Date(Date.now() + 2 * 3600_000);
  start.setMinutes(0, 0, 0);
  const [startsAt, setStartsAt] = useState(localInput(start));
  const [endsAt, setEndsAt] = useState(localInput(new Date(start.getTime() + 3 * 3600_000)));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (router.isReady) setLive(router.query.live === '1');
  }, [router.isReady, router.query.live]);

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ venues: VenueDTO[] }>(`/api/venues${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
        .then((r) => setVenues(r.venues))
        .catch(() => setVenues([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function submit() {
    if (!venue) return toast('Pick a venue.', 'error');
    setBusy(true);
    try {
      const { id } = await post<{ id: string }>('/api/artist/sets', {
        venueId: venue.id,
        title: title.trim() || undefined,
        goLive: live,
        startsAt: live ? undefined : new Date(startsAt).toISOString(),
        endsAt: live ? new Date(Date.now() + 3 * 3600_000).toISOString() : new Date(endsAt).toISOString(),
      });
      toast(live ? "You're live — the crowd can request now." : 'Set added to your bookings.', 'success');
      router.replace(`/sets/${id}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  }

  return (
    <Screen nav theme="green" title={live ? 'Connect to venue' : 'New request set'}>
      <TitleBar title={live ? 'Connect To Venue' : 'New Request Set'} back />
      <section className="glow-card mx-[10px] px-6 pb-8 pt-7">
        <div className="mb-6 grid grid-cols-2 gap-2 rounded-full bg-black/40 p-1">
          {[
            ['Go live now', true],
            ['Schedule', false],
          ].map(([label, v]) => (
            <button key={String(label)} type="button" onClick={() => setLive(v as boolean)} className={cx('rounded-full py-2.5 font-din text-[13px] font-bold uppercase tracking-wider', live === v ? 'bg-lime text-lime-ink' : 'text-white/70')}>
              {label as string}
            </button>
          ))}
        </div>

        <label className="label">Venue</label>
        {venue ? (
          <div className="flex items-center gap-3 rounded-2xl bg-black/40 p-2 pr-4">
            {venue.imageUrl && <img src={venue.imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />}
            <span className="flex-1">
              <span className="block font-din text-[15px] font-bold uppercase tracking-wide text-white">{venue.name}</span>
              <span className="block font-ui text-[12px] text-white/60">{venue.city}</span>
            </span>
            <button type="button" onClick={() => setVenue(null)} className="font-ui text-[12px] text-white/70 underline">
              Change
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <IconSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50" />
              <input className="field pl-11" placeholder="Search venues" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="mt-2 flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
              {venues.map((v) => (
                <button key={v.id} type="button" onClick={() => setVenue(v)} className="flex items-center gap-3 rounded-2xl bg-black/30 p-2 text-left">
                  {v.imageUrl ? <img src={v.imageUrl} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <span className="h-10 w-10 rounded-xl bg-white/10" />}
                  <span>
                    <span className="block font-ui text-[14px] font-semibold text-white">{v.name}</span>
                    <span className="block font-ui text-[12px] text-white/55">{v.city}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <label className="label mt-5">Set name (optional)</label>
        <input className="field" placeholder={venue ? venue.name : 'e.g. Friday Night'} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />

        {!live && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Starts</label>
              <input type="datetime-local" className="field px-3 text-[13px]" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div>
              <label className="label">Ends</label>
              <input type="datetime-local" className="field px-3 text-[13px]" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
        )}

        <button type="button" disabled={busy || !venue} onClick={submit} className="glass-pill mt-7 h-[60px] w-full text-[15px] disabled:opacity-50">
          {busy ? 'Saving…' : live ? 'Go Live' : 'Add Request Set'}
        </button>
        <p className="mt-3 text-center font-ui text-[11px] text-white/50">Your Creative Controls (request intake, unit cost, On The Mic) apply to this set.</p>
      </section>
    </Screen>
  );
};

NewSet.auth = ['PERFORMER'];
export default NewSet;
