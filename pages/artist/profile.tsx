/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import type { AuxedPage } from '../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { IconCamera, IconX } from '@/components/Icons';
import { Loader } from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { put, errorMessage } from '@/lib/client/api';
import { prepareImage, uploadImage } from '@/lib/client/image';
import { cx } from '@/lib/util';
import type { PerformerDTO } from '@/lib/types';

/** Artist portfolio: stage name, type, bio, genres and photo shown to the crowd. */
const ArtistProfile: AuxedPage = () => {
  const toast = useToast();
  const { data } = useApi<{ performer: PerformerDTO }>('/api/artist/profile');
  const [p, setP] = useState<PerformerDTO | null>(null);
  const [genre, setGenre] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data && !p) setP(data.performer);
  }, [data, p]);
  if (!p) return <Loader />;

  async function onPhoto(file?: File) {
    if (!file || !p) return;
    try {
      const url = await uploadImage(await prepareImage(file, { maxDim: 1200 }));
      setP({ ...p, imageUrl: url });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function save() {
    if (!p) return;
    setBusy(true);
    try {
      await put('/api/artist/profile', { name: p.name, type: p.type, bio: p.bio ?? '', genres: p.genres, imageUrl: p.imageUrl });
      toast('Portfolio saved.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen nav theme="green" title="Artist Portfolio">
      <TitleBar title="Artist Portfolio" back />
      <section className="glow-card mx-[10px] px-6 pb-8 pt-7">
        <button type="button" onClick={() => fileRef.current?.click()} className="relative mx-auto block h-[150px] w-[150px] overflow-hidden rounded-full bg-black/50 shadow-[0_0_0_4px_rgba(255,255,255,0.8)]">
          {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-white/60">Add photo</span>}
          <span className="absolute bottom-2 right-6 flex h-8 w-8 items-center justify-center rounded-full bg-black text-white">
            <IconCamera size={15} />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />

        <label className="label mt-6">Stage name</label>
        <input className="field" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} maxLength={60} />

        <label className="label mt-4">I am a</label>
        <div className="grid grid-cols-2 gap-2">
          {(['DJ', 'ARTIST'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setP({ ...p, type: t })} className={cx('rounded-full py-3 font-din text-[13px] font-bold uppercase tracking-wider', p.type === t ? 'bg-lime text-lime-ink' : 'bg-black/40 text-white/80')}>
              {t === 'DJ' ? 'DJ' : 'Artist'}
            </button>
          ))}
        </div>

        <label className="label mt-4">Genres</label>
        <div className="flex flex-wrap gap-2">
          {p.genres.map((g) => (
            <button key={g} type="button" onClick={() => setP({ ...p, genres: p.genres.filter((x) => x !== g) })} className="flex items-center gap-1 rounded-full bg-black/45 px-3 py-1.5 font-ui text-[12px] text-white">
              {g} <IconX size={10} />
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input className="field" placeholder="Add a genre" value={genre} onChange={(e) => setGenre(e.target.value)} maxLength={30} />
          <button
            type="button"
            onClick={() => {
              const g = genre.trim();
              if (g && !p.genres.includes(g) && p.genres.length < 8) setP({ ...p, genres: [...p.genres, g] });
              setGenre('');
            }}
            className="shrink-0 rounded-full bg-white/15 px-5 font-din text-[13px] font-bold uppercase text-white"
          >
            Add
          </button>
        </div>

        <label className="label mt-4">Bio</label>
        <textarea className="field-area min-h-[110px]" maxLength={500} value={p.bio ?? ''} onChange={(e) => setP({ ...p, bio: e.target.value })} placeholder="Tell the crowd what you're about." />

        <button type="button" disabled={busy} onClick={save} className="glass-pill mt-6 h-[60px] w-full text-[15px] disabled:opacity-50">
          {busy ? 'Saving…' : 'Save Portfolio'}
        </button>
      </section>
    </Screen>
  );
};

ArtistProfile.auth = ['PERFORMER'];
export default ArtistProfile;
