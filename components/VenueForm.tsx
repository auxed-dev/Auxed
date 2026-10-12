/* eslint-disable @next/next/no-img-element */
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { prepareImage, uploadImage } from '@/lib/client/image';
import { errorMessage } from '@/lib/client/api';
import { cx } from '@/lib/util';
import { GENRE_SUGGESTIONS, MAX_HOUSE_GENRES } from '@/lib/genres';
import type { VenueDTO, VenueKind } from '@/lib/types';
import { VenueLogo } from './VenueLogo';
import { IconCamera, IconPin } from './Icons';
import { useToast } from './Toast';

const MapPicker = dynamic(() => import('./MapPicker'), { ssr: false, loading: () => <div className="h-[220px] rounded-[18px] bg-black/40" /> });

export type VenueFormValue = Omit<VenueDTO, 'id' | 'ownerId' | 'lat' | 'lng'> & { lat: number | null; lng: number | null };

export const EMPTY_VENUE: VenueFormValue = {
  name: '',
  kind: 'CLUB',
  city: '',
  address: '',
  lat: null,
  lng: null,
  imageUrl: null,
  logoStyle: 'wide',
  description: '',
  chatLabel: 'CLUB CHAT',
  managementLabel: 'Management Team',
  capacity: 500,
  liveCapacity: 0,
  avgWeek: 0,
  avgMonth: 0,
  waitMinutes: null,
  artistSharePct: 50,
  safetyPhone: null,
  musicGenres: [],
};

const KINDS: { value: VenueKind; label: string }[] = [
  { value: 'CLUB', label: 'Club' },
  { value: 'LOUNGE', label: 'Lounge' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'GYM', label: 'Gym' },
  { value: 'FESTIVAL', label: 'Festival ground' },
];

/** Register / edit an establishment. */
export function VenueForm({ initial, submitLabel, onSubmit }: { initial: VenueFormValue; submitLabel: string; onSubmit: (v: VenueFormValue) => Promise<void> }) {
  const toast = useToast();
  const [v, setV] = useState<VenueFormValue>(initial);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof VenueFormValue>(k: K, val: VenueFormValue[K]) => setV((p) => ({ ...p, [k]: val }));
  const num = (s: string) => (s === '' ? 0 : Math.max(0, Math.round(Number(s) || 0)));

  async function photo(file?: File) {
    if (!file) return;
    try {
      set('imageUrl', await uploadImage(await prepareImage(file, { maxDim: 1600 })));
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function submit() {
    if (v.lat === null || v.lng === null) return toast('Drop a pin on the map so AUXees can find you.', 'error');
    setBusy(true);
    try {
      await onSubmit(v);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => fileRef.current?.click()} className="relative h-[180px] overflow-hidden rounded-[22px] bg-black/40">
        {v.imageUrl ? <img src={v.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="font-ui text-[13px] text-white/60">Add a venue photo</span>}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/70" />
        <div className="absolute bottom-3 left-4 right-14 text-left">{v.name && <VenueLogo name={v.name} style={v.logoStyle} size="sm" />}</div>
        <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white">
          <IconCamera size={16} />
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => photo(e.target.files?.[0])} />

      <Field label="Venue name">
        <input className="field" value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
      </Field>
      <Field label="Title style">
        <div className="grid grid-cols-3 gap-2">
          {(['wide', 'serif', 'cond'] as const).map((s) => (
            <button key={s} type="button" onClick={() => set('logoStyle', s)} className={cx('flex h-[54px] items-center justify-center overflow-hidden rounded-2xl px-2', v.logoStyle === s ? 'bg-lime/20 ring-2 ring-lime' : 'bg-black/35')}>
              <VenueLogo name={(v.name || 'Venue').split(' ')[0]} style={s} size="sm" className="!leading-none" />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Type">
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button key={k.value} type="button" onClick={() => set('kind', k.value)} className={cx('rounded-full px-3.5 py-2 font-ui text-[12px] font-semibold', v.kind === k.value ? 'bg-lime text-lime-ink' : 'bg-black/35 text-white/85')}>
              {k.label}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City">
          <input className="field" value={v.city} onChange={(e) => set('city', e.target.value)} maxLength={60} />
        </Field>
        <Field label="Area / address">
          <input className="field" value={v.address} onChange={(e) => set('address', e.target.value)} maxLength={160} />
        </Field>
      </div>
      <Field label="Location">
        <MapPicker lat={v.lat} lng={v.lng} onPick={(lat, lng) => setV((p) => ({ ...p, lat, lng }))} />
        <button
          type="button"
          onClick={() =>
            navigator.geolocation?.getCurrentPosition(
              (pos) => setV((p) => ({ ...p, lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 })),
              () => toast('Allow location access, or tap the map to place the pin.', 'error'),
            )
          }
          className="mt-2 flex items-center gap-1.5 font-ui text-[12px] font-semibold text-white/80"
        >
          <IconPin size={14} /> Use my current location
          {v.lat !== null && <span className="text-white/45"> · {v.lat.toFixed(4)}, {v.lng?.toFixed(4)}</span>}
        </button>
      </Field>
      <Field label="Description">
        <textarea className="field-area min-h-[80px]" value={v.description} onChange={(e) => set('description', e.target.value)} maxLength={400} placeholder="Shown under your management label in the room." />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Chat name">
          <input className="field" value={v.chatLabel} onChange={(e) => set('chatLabel', e.target.value.toUpperCase())} maxLength={30} />
        </Field>
        <Field label="Management label">
          <input className="field" value={v.managementLabel} onChange={(e) => set('managementLabel', e.target.value)} maxLength={40} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Capacity">
          <input className="field" inputMode="numeric" value={v.capacity || ''} onChange={(e) => set('capacity', num(e.target.value))} />
        </Field>
        <Field label="In right now">
          <input className="field" inputMode="numeric" value={v.liveCapacity || ''} onChange={(e) => set('liveCapacity', num(e.target.value))} />
        </Field>
        <Field label="Avg visitors / week">
          <input className="field" inputMode="numeric" value={v.avgWeek || ''} onChange={(e) => set('avgWeek', num(e.target.value))} />
        </Field>
        <Field label="Avg visitors / month">
          <input className="field" inputMode="numeric" value={v.avgMonth || ''} onChange={(e) => set('avgMonth', num(e.target.value))} />
        </Field>
        <Field label="Door wait (min)">
          <input className="field" inputMode="numeric" value={v.waitMinutes ?? ''} placeholder="—" onChange={(e) => set('waitMinutes', e.target.value === '' ? null : num(e.target.value))} />
        </Field>
        <Field label="Artist share %">
          <input className="field" inputMode="numeric" value={v.artistSharePct} onChange={(e) => set('artistSharePct', Math.min(100, num(e.target.value)))} />
        </Field>
      </div>
      <Field label="House sound">
        <div className="flex flex-wrap gap-2">
          {GENRE_SUGGESTIONS.map((g) => {
            const on = v.musicGenres.includes(g);
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                disabled={!on && v.musicGenres.length >= MAX_HOUSE_GENRES}
                onClick={() => set('musicGenres', on ? v.musicGenres.filter((x) => x !== g) : [...v.musicGenres, g])}
                className={cx('rounded-full px-3 py-1.5 font-ui text-[12px] transition disabled:opacity-40', on ? 'bg-lime font-semibold text-lime-ink' : 'bg-white/10 text-white/75')}
              >
                {g}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 px-1 font-ui text-[11px] text-white/50">The genres you want played here. Request suggestions lean towards your house sound and the DJ&apos;s genre mix.</p>
      </Field>
      <Field label="Safety / security phone (SOS button)">
        <input className="field" inputMode="tel" value={v.safetyPhone ?? ''} placeholder="+27…" onChange={(e) => set('safetyPhone', e.target.value || null)} />
      </Field>
      <p className="-mt-2 px-2 font-ui text-[11px] text-white/50">Artist share is the part of each request&apos;s tokens that goes to the performing artist; the rest goes to the venue.</p>
      <button type="button" disabled={busy || !v.name.trim() || !v.city.trim()} onClick={submit} className="glass-pill mt-2 h-[60px] w-full text-[15px] disabled:opacity-50">
        {busy ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
