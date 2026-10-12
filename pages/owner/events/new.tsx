/* eslint-disable @next/next/no-img-element */
import { useRouter } from 'next/router';
import { useRef, useState } from 'react';
import type { AuxedPage } from '../../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { IconCamera, IconPlus, IconX } from '@/components/Icons';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { post, errorMessage } from '@/lib/client/api';
import { prepareImage, uploadImage } from '@/lib/client/image';
import { cx } from '@/lib/util';
import type { VenueDTO } from '@/lib/types';

function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const HERO = ['#0E9F5A', '#0B1A6B', '#7A1FD0', '#E5006E', '#D2461F', '#111111'];

/** Post an event (festival or club night) with its stages. */
const NewEvent: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const { data } = useApi<{ venues: VenueDTO[] }>('/api/owner/venues');
  const start = new Date(Date.now() + 7 * 86400_000);
  start.setHours(14, 0, 0, 0);
  const [form, setForm] = useState({
    title: '',
    category: 'FESTIE' as 'FESTIE' | 'CLUB',
    venueId: '',
    location: '',
    subtitle: '',
    description: '',
    heroColor: HERO[0],
    startsAt: localInput(start),
    endsAt: localInput(new Date(start.getTime() + 12 * 3600_000)),
    imageUrl: null as string | null,
  });
  const [stages, setStages] = useState<string[]>(['MAIN STAGE']);
  const [stage, setStage] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function poster(file?: File) {
    if (!file) return;
    try {
      set('imageUrl', await uploadImage(await prepareImage(file, { maxDim: 1600 })));
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function submit() {
    setBusy(true);
    try {
      const { id } = await post<{ id: string }>('/api/owner/events', {
        ...form,
        venueId: form.venueId || undefined,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        stages,
      });
      toast('Event posted.', 'success');
      router.replace(`/events/${id}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  }

  return (
    <Screen nav theme="purple" title="Post an event">
      <TitleBar title="Post An Event" back="/owner" />
      <section className="glow-card mx-[10px] flex flex-col gap-4 px-5 pb-8 pt-6">
        <button type="button" onClick={() => fileRef.current?.click()} className="relative h-[220px] overflow-hidden rounded-[24px]" style={{ background: form.heroColor }}>
          {form.imageUrl ? <img src={form.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="font-ui text-[13px] text-white/80">Add the event poster</span>}
          <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white">
            <IconCamera size={16} />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => poster(e.target.files?.[0])} />
        <div className="flex gap-2">
          {HERO.map((c) => (
            <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => set('heroColor', c)} className={cx('h-7 w-7 rounded-full border-2', form.heroColor === c ? 'border-lime' : 'border-white/20')} style={{ background: c }} />
          ))}
        </div>

        <div>
          <label className="label">Event name</label>
          <input className="field" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={80} />
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-full bg-black/40 p-1">
          {(['FESTIE', 'CLUB'] as const).map((c) => (
            <button key={c} type="button" onClick={() => set('category', c)} className={cx('rounded-full py-2.5 font-din text-[13px] font-bold uppercase tracking-wider', form.category === c ? 'bg-lime text-lime-ink' : 'text-white/70')}>
              {c === 'FESTIE' ? 'At the Festie' : 'In da Club'}
            </button>
          ))}
        </div>
        <div>
          <label className="label">Venue</label>
          <select className="field appearance-none" value={form.venueId} onChange={(e) => set('venueId', e.target.value)}>
            <option value="" className="bg-black">
              Somewhere else (enter the location)
            </option>
            {data?.venues.map((v) => (
              <option key={v.id} value={v.id} className="bg-black">
                {v.name}
              </option>
            ))}
          </select>
        </div>
        {!form.venueId && (
          <div>
            <label className="label">Location</label>
            <input className="field" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Legends Adventure Farm, Pretoria" maxLength={120} />
          </div>
        )}
        <div>
          <label className="label">Subtitle (shown on the card)</label>
          <input className="field" value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} maxLength={120} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Starts</label>
            <input type="datetime-local" className="field px-3 text-[13px]" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
          </div>
          <div>
            <label className="label">Ends</label>
            <input type="datetime-local" className="field px-3 text-[13px]" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="field-area min-h-[90px]" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={1000} />
        </div>
        <div>
          <label className="label">Stages</label>
          <div className="flex flex-wrap gap-2">
            {stages.map((s) => (
              <button key={s} type="button" onClick={() => setStages(stages.filter((x) => x !== s))} className="flex items-center gap-1 rounded-full bg-black/45 px-3 py-1.5 font-din text-[11px] font-bold uppercase tracking-wider text-white">
                {s} <IconX size={10} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="field" placeholder="e.g. VIP LOUNGE EXCLUSIVE" value={stage} onChange={(e) => setStage(e.target.value)} maxLength={40} />
            <button
              type="button"
              aria-label="Add stage"
              onClick={() => {
                const s = stage.trim().toUpperCase();
                if (s && !stages.includes(s) && stages.length < 12) setStages([...stages, s]);
                setStage('');
              }}
              className="flex w-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-white"
            >
              <IconPlus size={16} />
            </button>
          </div>
        </div>
        <button type="button" disabled={busy || form.title.trim().length < 2} onClick={submit} className="glass-pill mt-2 h-[60px] w-full text-[15px] disabled:opacity-50">
          {busy ? 'Posting…' : 'Post Event'}
        </button>
      </section>
    </Screen>
  );
};

NewEvent.auth = ['OWNER'];
export default NewEvent;
