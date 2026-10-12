/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { AuxedPage } from '../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { Sheet } from '@/components/ui';
import { SlotRow, TrackPanel, TrackRow } from '@/components/TrackList';
import { IconCaretDown, IconPlus, IconSearch, IconX } from '@/components/Icons';
import { Loader } from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { api, put, errorMessage } from '@/lib/client/api';
import { duration, shortDate } from '@/lib/format';
import type { CreativeControls, PerformanceStatus, Track } from '@/lib/types';

interface SetItem {
  id: string;
  title: string;
  venue: string;
  venueId: string;
  startsAt: string;
  endsAt: string;
  status: PerformanceStatus;
  setlist: Track[];
}

/** My Set Box: your track list per set, with the crowd's request slots woven in. */
const SetBox: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const { data, reload } = useApi<{ sets: SetItem[] }>('/api/artist/sets');
  const { data: ctl } = useApi<{ controls: CreativeControls }>('/api/artist/controls');
  const [selected, setSelected] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [filters, setFilters] = useState(false);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [genre, setGenre] = useState('');
  const [maxMin, setMaxMin] = useState(0);
  const [list, setList] = useState<Track[] | null>(null);
  const [dirty, setDirty] = useState(false);

  const sets = useMemo(() => data?.sets ?? [], [data]);
  useEffect(() => {
    if (!sets.length || selected) return;
    const q = typeof router.query.set === 'string' ? router.query.set : null;
    setSelected(sets.find((s) => s.id === q)?.id ?? sets.find((s) => s.status === 'LIVE')?.id ?? sets.find((s) => s.status === 'UPCOMING')?.id ?? sets[0].id);
  }, [sets, selected, router.query.set]);
  const set = sets.find((s) => s.id === selected) ?? null;
  useEffect(() => {
    setList(set ? set.setlist : null);
    setDirty(false);
  }, [set]);

  if (!data) return <Loader />;

  const filterCount = [text, genre, maxMin].filter(Boolean).length;
  const shown = (list ?? []).filter(
    (t) =>
      (!text || `${t.title} ${t.artist} ${t.album ?? ''}`.toLowerCase().includes(text.toLowerCase())) &&
      (!genre || (t.genre ?? '').toLowerCase() === genre.toLowerCase()) &&
      (!maxMin || t.durationSec <= maxMin * 60),
  );
  const genres = [...new Set((list ?? []).map((t) => t.genre).filter(Boolean) as string[])];
  const slots = Math.min(ctl?.controls.requestIntake ?? 2, Math.max(1, Math.ceil(shown.length / 2)));
  const editable = set && set.status !== 'ENDED';

  async function save() {
    if (!set || !list) return;
    try {
      await put(`/api/artist/sets/${set.id}`, { setlist: list });
      toast('Set list saved.', 'success');
      setDirty(false);
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }
  const update = (next: Track[]) => {
    setList(next);
    setDirty(true);
  };

  return (
    <Screen nav theme="green" title="My Set Box">
      <TitleBar title="My Set Box" back="/artist" />
      {!set ? (
        <div className="px-6">
          <p className="panel px-5 py-6 text-center font-ui text-[14px] text-white/75">
            No sets yet.{' '}
            <Link href="/artist/sets/new" className="font-semibold underline">
              Add a new request set
            </Link>
          </p>
        </div>
      ) : (
        <TrackPanel title={set.title} date={shortDate(set.startsAt).replace(/\/(\d\d)$/, '/20$1')} filters={filterCount} onPickSet={() => setPicker(true)} onAddFilters={() => setFilters(true)}>
          {shown.map((t, i) => (
            <Fragment key={`${t.title}-${i}`}>
              <TrackRow
                title={t.title}
                artist={t.artist}
                album={t.album}
                sec={t.durationSec}
                artwork={t.artwork}
                actions={
                  editable && !filterCount ? (
                    <button
                      type="button"
                      aria-label={`Remove ${t.title}`}
                      onClick={() => update((list ?? []).filter((_, j) => j !== i))}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-black/80 text-white/80"
                    >
                      <IconX size={11} />
                    </button>
                  ) : undefined
                }
              />
              {i % 2 === 0 && Math.floor(i / 2) < slots && <SlotRow onClick={() => router.push(`/sets/${set.id}`)} />}
            </Fragment>
          ))}
          {shown.length === 0 && <SlotRow label={filterCount ? 'No tracks match' : 'Add your first track'} onClick={() => (filterCount ? setFilters(true) : setAdding(true))} />}
          {editable && (
            <button type="button" onClick={() => setAdding(true)} className="flex h-[56px] items-center justify-center gap-2 rounded-[16px] border border-dashed border-white/25 font-din text-[14px] font-bold uppercase tracking-[0.1em] text-white/75">
              <IconPlus size={14} /> Add a track
            </button>
          )}
          {dirty && (
            <button type="button" onClick={save} className="sticky bottom-[110px] mt-2 h-[52px] rounded-full bg-lime font-din text-[14px] font-bold uppercase tracking-wider text-lime-ink shadow-[0_0_24px_rgba(201,241,59,0.4)]">
              Save set list
            </button>
          )}
        </TrackPanel>
      )}

      <Sheet open={picker} onClose={() => setPicker(false)} title="Choose a set">
        <div className="flex max-h-[60dvh] flex-col gap-2 overflow-y-auto pb-2">
          {sets.map((s) => (
            <button key={s.id} type="button" onClick={() => (setSelected(s.id), setPicker(false))} className={`rounded-2xl px-4 py-3 text-left ${s.id === selected ? 'bg-lime/20' : 'bg-white/[0.07]'}`}>
              <span className="block font-din text-[14px] font-bold uppercase tracking-wide text-white">{s.title}</span>
              <span className="block font-ui text-[12px] text-white/60">
                {s.venue} · {shortDate(s.startsAt)} · {s.status === 'LIVE' ? 'Live now' : s.status === 'UPCOMING' ? 'Upcoming' : 'Played'} · {s.setlist.length} tracks
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={filters} onClose={() => setFilters(false)} title="Filters">
        <label className="label">Search this set</label>
        <input className="field" placeholder="Title, artist or album" value={text} onChange={(e) => setText(e.target.value)} />
        {genres.length > 0 && (
          <>
            <label className="label mt-4">Genre</label>
            <div className="flex flex-wrap gap-2">
              {['', ...genres].map((g) => (
                <button key={g || 'all'} type="button" onClick={() => setGenre(g)} className={`rounded-full px-3 py-1.5 font-ui text-[12px] ${genre === g ? 'bg-lime text-lime-ink' : 'bg-white/10 text-white/85'}`}>
                  {g || 'All'}
                </button>
              ))}
            </div>
          </>
        )}
        <label className="label mt-4">Max length</label>
        <div className="flex gap-2">
          {[0, 3, 4, 5, 7].map((m) => (
            <button key={m} type="button" onClick={() => setMaxMin(m)} className={`rounded-full px-3 py-1.5 font-ui text-[12px] ${maxMin === m ? 'bg-lime text-lime-ink' : 'bg-white/10 text-white/85'}`}>
              {m ? `≤ ${m} min` : 'Any'}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => (setText(''), setGenre(''), setMaxMin(0))} className="mt-5 w-full py-2 font-ui text-[13px] font-semibold text-white/70">
          Clear filters
        </button>
      </Sheet>

      <AddTrackSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(t) => {
          update([...(list ?? []), t]);
          toast(`Added ${t.title}. Save to keep it.`);
        }}
      />
    </Screen>
  );
};

function AddTrackSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (t: Track) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setResults([]);
    const t = setTimeout(() => {
      api<{ tracks: Track[] }>(`/api/music/search?q=${encodeURIComponent(term)}`)
        .then((r) => setResults(r.tracks))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Sheet open={open} onClose={onClose} title="Add a track">
      <div className="relative">
        <IconSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50" />
        <input className="field pl-11" placeholder="Search songs or artists" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="mt-3 flex max-h-[50dvh] flex-col gap-2 overflow-y-auto pb-2">
        {results.map((t) => (
          <button key={`${t.source}-${t.externalId ?? t.title}`} type="button" onClick={() => onAdd(t)} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-2 text-left">
            {t.artwork ? <img src={t.artwork.replace('600x600', '100x100')} alt="" className="h-11 w-11 rounded-lg object-cover" /> : <span className="h-11 w-11 rounded-lg bg-white/10" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-din text-[13px] font-bold uppercase text-white">{t.title}</span>
              <span className="block truncate font-ui text-[12px] text-white/60">
                {t.artist} · {duration(t.durationSec)}
              </span>
            </span>
            <IconPlus size={16} className="mr-2 text-white/70" />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

SetBox.auth = ['PERFORMER'];
export default SetBox;
