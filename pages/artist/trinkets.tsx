import { useEffect, useState } from 'react';
import type { AuxedPage } from '../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { Sheet } from '@/components/ui';
import { TrackPanel, TrackRow } from '@/components/TrackList';
import { Loader } from '@/components/Loader';
import { useApi } from '@/lib/client/useApi';
import { shortDate } from '@/lib/format';

interface TrinketData {
  sets: { id: string; title: string; venue: string; startsAt: string; endsAt: string; requests: number }[];
  selected: string | null;
  tracks: { title: string; artist: string; album: string | null; artwork: string | null; count: number }[];
}

/** The People's Trinkets: what the crowd asked for at each of your sets. */
const Trinkets: AuxedPage = () => {
  const [performanceId, setPerformanceId] = useState<string | null>(null);
  const { data } = useApi<TrinketData>(`/api/artist/trinkets${performanceId ? `?performanceId=${performanceId}` : ''}`);
  const [picker, setPicker] = useState(false);
  const [filters, setFilters] = useState(false);
  const [minAsks, setMinAsks] = useState(0);
  const [text, setText] = useState('');

  useEffect(() => {
    if (data?.selected && !performanceId) setPerformanceId(data.selected);
  }, [data, performanceId]);

  if (!data) return <Loader />;
  const set = data.sets.find((s) => s.id === (performanceId ?? data.selected));
  const range = set ? `${shortDate(set.startsAt).slice(0, 2)}-${shortDate(set.endsAt)}` : '—';
  const tracks = data.tracks.filter((t) => t.count >= minAsks && (!text || `${t.title} ${t.artist}`.toLowerCase().includes(text.toLowerCase())));

  return (
    <Screen nav theme="olive" title="The People's Trinkets">
      <TitleBar title="The People’s Trinkets" back="/artist" />
      {!set ? (
        <p className="panel mx-6 px-5 py-6 text-center font-ui text-[14px] text-white/75">Once the crowd starts requesting at your sets, their picks are collected here.</p>
      ) : (
        <TrackPanel title={set.title} date={range} filters={[minAsks, text].filter(Boolean).length} onPickSet={() => setPicker(true)} onAddFilters={() => setFilters(true)}>
          {tracks.map((t) => (
            <TrackRow
              key={t.title + t.artist}
              tone="olive"
              title={t.title}
              artist={t.artist}
              album={t.album ?? undefined}
              artwork={t.artwork}
              badge={t.count > 1 ? <span className="rounded-full bg-black/35 px-2 py-0.5 font-din text-[9px] font-bold uppercase tracking-wider text-white/90">{t.count} requests</span> : undefined}
            />
          ))}
          {tracks.length === 0 && <p className="py-6 text-center font-ui text-[13px] text-white/70">No tracks match these filters.</p>}
        </TrackPanel>
      )}

      <Sheet open={picker} onClose={() => setPicker(false)} title="Choose a set">
        <div className="flex max-h-[60dvh] flex-col gap-2 overflow-y-auto pb-2">
          {data.sets.map((s) => (
            <button key={s.id} type="button" onClick={() => (setPerformanceId(s.id), setPicker(false))} className={`rounded-2xl px-4 py-3 text-left ${s.id === set?.id ? 'bg-lime/20' : 'bg-white/[0.07]'}`}>
              <span className="block font-din text-[14px] font-bold uppercase tracking-wide text-white">{s.title}</span>
              <span className="block font-ui text-[12px] text-white/60">
                {s.venue} · {shortDate(s.startsAt)} · {s.requests} requests
              </span>
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={filters} onClose={() => setFilters(false)} title="Filters">
        <label className="label">Search</label>
        <input className="field" placeholder="Title or artist" value={text} onChange={(e) => setText(e.target.value)} />
        <label className="label mt-4">Requested at least</label>
        <div className="flex gap-2">
          {[0, 2, 3, 5].map((n) => (
            <button key={n} type="button" onClick={() => setMinAsks(n)} className={`rounded-full px-3 py-1.5 font-ui text-[12px] ${minAsks === n ? 'bg-lime text-lime-ink' : 'bg-white/10 text-white/85'}`}>
              {n ? `${n}×` : 'Any'}
            </button>
          ))}
        </div>
      </Sheet>
    </Screen>
  );
};

Trinkets.auth = ['PERFORMER'];
export default Trinkets;
