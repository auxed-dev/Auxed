/* eslint-disable @next/next/no-img-element */
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import type { AuxedPage } from './_app';
import { Screen, TitleBar } from '@/components/Screen';
import { Avatar, Marquee, Sheet } from '@/components/ui';
import { IconLive, IconPlus, IconRepost } from '@/components/Icons';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { post, errorMessage } from '@/lib/client/api';
import { PHOTO_FILTERS, prepareImage, uploadImage } from '@/lib/client/image';
import { useSession } from '@/lib/client/session';
import { compact } from '@/lib/format';
import { cx } from '@/lib/util';
import type { RoomDTO } from '@/lib/types';
import type { MapVenue } from '@/components/MapView';

/** Live Pic Snippet / Capture The Moment: a photo + a few words, shared to a set's chat or the Wire Room. */
const Snippet: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const [performanceId, setPerformanceId] = useState<string | null>(null);
  const { data: room } = useApi<RoomDTO>(performanceId ? `/api/performances/${performanceId}` : null);
  const { data: map } = useApi<{ venues: MapVenue[] }>('/api/map');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [filter, setFilter] = useState(PHOTO_FILTERS[0]);
  const [filters, setFilters] = useState(false);
  const [picker, setPicker] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (router.isReady && typeof router.query.performanceId === 'string') setPerformanceId(router.query.performanceId);
  }, [router.isReady, router.query.performanceId]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const liveSets = (map?.venues ?? []).flatMap((v) => v.live.map((l) => ({ ...l, venue: v.name, image: v.imageUrl })));
  const p = room?.performance;
  const np = p?.nowPlaying?.track;

  async function share() {
    if (!file && !text.trim()) return toast('Add a photo or a few words.', 'error');
    setBusy(true);
    try {
      const imageUrl = file ? await uploadImage(await prepareImage(file, { filter: filter.css })) : undefined;
      await post('/api/posts', { kind: 'SNIPPET', performanceId, text: text.trim(), imageUrl });
      toast(performanceId ? 'Shared to the set!' : 'Shared to the Wire Room!', 'success');
      router.push(performanceId ? `/sets/${performanceId}` : '/wire');
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  }

  return (
    <Screen title="Live Pic Snippet" className="pb-10">
      <TitleBar title={performanceId ? 'Live Pic Snippet' : 'Pic Snippet'} back />
      <section className="glow-card mx-[10px] px-[26px] pb-8 pt-[34px]" style={{ borderRadius: 34 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar src={user?.avatarUrl} name={user?.userName} size={34} ring="#6B4A3A" />
            <div>
              <p className="font-din text-[11px] font-bold uppercase tracking-[0.08em] text-white">{user?.userName}</p>
              <button type="button" onClick={() => setPicker(true)} className="block font-din text-[7.5px] font-bold uppercase tracking-[0.12em] text-white/70">
                {p ? `At ${p.venue.name} Auxed` : 'Choose a set ▾'}
              </button>
            </div>
          </div>
          <button type="button" onClick={() => setFilters(true)} className="flex items-center gap-1.5 font-din text-[14px] font-bold uppercase tracking-[0.06em] text-white/85">
            <span className="flex h-[17px] w-[17px] items-center justify-center rounded-full bg-black/60">
              <IconPlus size={11} />
            </span>
            Add Filters
          </button>
        </div>

        <button
          type="button"
          onClick={() => input.current?.click()}
          className="relative mt-5 flex h-[404px] w-full flex-col items-center justify-center overflow-hidden rounded-[24px] bg-black/45 shadow-[inset_0_0_40px_rgba(0,0,0,0.6)]"
        >
          {preview ? (
            <img src={preview} alt="Your snippet" className="absolute inset-0 h-full w-full object-cover" style={{ filter: filter.css }} />
          ) : (
            <>
              <CameraArt />
              <span className="mt-6 text-center font-din text-[14px] font-bold uppercase leading-[1.9] tracking-[0.12em] text-white/80">
                + Add your memory
                <br />
                of the moment
              </span>
            </>
          )}
        </button>
        <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

        {p ? (
          <div className="relative mt-6 h-[104px] overflow-hidden rounded-[18px] bg-white/80">
            {(np?.artwork ?? p.imageUrl) && <img src={(np?.artwork ?? p.imageUrl)!} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />}
            <div className="absolute inset-0 bg-white/30" />
            <Marquee
              text={np ? `CURRENTLY PLAYING • ${np.title.toUpperCase()} • ${np.artist.toUpperCase()}` : `LIVE AT ${p.venue.name.toUpperCase()}`}
              className="relative mt-3 px-3 font-din text-[12px] font-bold uppercase tracking-[0.14em] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]"
            />
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between font-din text-[12px] font-bold uppercase tracking-[0.1em] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
              <span className="flex items-center gap-1.5">
                <IconRepost size={20} /> {compact(p.reposts)}
              </span>
              <span className="flex items-center gap-2 truncate">
                <span className="truncate">Live at {p.venue.name}</span>
                <IconLive size={24} />
              </span>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setPicker(true)} className="mt-6 flex h-[80px] w-full items-center justify-center rounded-[18px] bg-black/40 font-din text-[14px] font-bold uppercase tracking-[0.1em] text-white/75">
            ♪ Tag a live set (optional)
          </button>
        )}

        <div className="mt-6 rounded-[14px] border border-white/10 bg-black/30 p-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="Type something...share some words of love and light with the audience !"
            className="min-h-[100px] w-full resize-none rounded-[10px] bg-black/60 px-5 py-6 text-center font-ui text-[12px] font-semibold leading-[2] text-white outline-none placeholder:text-white/70"
          />
        </div>
        <button type="button" disabled={busy || (!file && !text.trim())} onClick={share} className="glass-pill mt-6 h-[58px] w-full text-[15px] disabled:opacity-50">
          {busy ? 'Sharing…' : performanceId ? 'Share to the set' : 'Share to the Wire Room'}
        </button>
      </section>

      <Sheet open={filters} onClose={() => setFilters(false)} title="Filters">
        <div className="grid grid-cols-3 gap-3 pb-2">
          {PHOTO_FILTERS.map((f) => (
            <button key={f.name} type="button" onClick={() => (setFilter(f), setFilters(false))} className={cx('overflow-hidden rounded-2xl border-2', filter.name === f.name ? 'border-lime' : 'border-transparent')}>
              <div className="h-[84px] bg-black">
                {preview ? (
                  <img src={preview} alt="" className="h-full w-full object-cover" style={{ filter: f.css }} />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-[#ff4fa3] via-[#3b6cff] to-[#2e5e4d]" style={{ filter: f.css }} />
                )}
              </div>
              <p className="py-1.5 text-center font-din text-[11px] font-bold uppercase tracking-wider text-white">{f.name}</p>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={picker} onClose={() => setPicker(false)} title="Tag a live set">
        <div className="flex max-h-[55dvh] flex-col gap-2 overflow-y-auto pb-2">
          <button type="button" onClick={() => (setPerformanceId(null), setPicker(false))} className={cx('rounded-2xl px-4 py-3 text-left font-ui text-[14px] font-semibold', !performanceId ? 'bg-lime/20 text-lime' : 'bg-white/[0.07] text-white')}>
            No set — post to the Wire Room
          </button>
          {liveSets.map((s) => (
            <button key={s.id} type="button" onClick={() => (setPerformanceId(s.id), setPicker(false))} className={cx('flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left', performanceId === s.id ? 'bg-lime/20' : 'bg-white/[0.07]')}>
              {s.image && <img src={s.image} alt="" className="h-10 w-10 rounded-xl object-cover" />}
              <span>
                <span className="block font-ui text-[14px] font-semibold text-white">{s.venue}</span>
                <span className="block font-ui text-[12px] text-white/60">{s.performer}</span>
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </Screen>
  );
};

function CameraArt() {
  return (
    <svg width="118" height="88" viewBox="0 0 118 88" aria-hidden className="drop-shadow-[0_0_24px_rgb(var(--accent-soft)/0.35)]">
      <defs>
        <linearGradient id="cam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(var(--accent-soft))" stopOpacity=".55" />
          <stop offset="1" stopColor="rgb(var(--accent))" stopOpacity=".55" />
        </linearGradient>
      </defs>
      <rect x="34" y="0" width="52" height="16" rx="3" fill="url(#cam)" />
      <rect x="0" y="14" width="118" height="74" rx="6" fill="url(#cam)" />
      <circle cx="56" cy="54" r="21" fill="none" stroke="#0b1210" strokeOpacity=".75" strokeWidth="8" />
      <rect x="10" y="24" width="14" height="8" rx="1.5" fill="#0b1210" fillOpacity=".6" />
      <circle cx="92" cy="30" r="5.5" fill="none" stroke="#0b1210" strokeOpacity=".7" strokeWidth="4" />
      <circle cx="106" cy="30" r="5.5" fill="none" stroke="#0b1210" strokeOpacity=".7" strokeWidth="4" />
    </svg>
  );
}

Snippet.auth = true;
export default Snippet;
