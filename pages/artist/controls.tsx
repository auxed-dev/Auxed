/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import type { AuxedPage } from '../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { Sheet } from '@/components/ui';
import { IconCaretDown, IconPlus, IconSparkle, IconX } from '@/components/Icons';
import { Loader } from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { put, errorMessage } from '@/lib/client/api';
import { cx } from '@/lib/util';
import type { CreativeControls, LeadTime, MicMode } from '@/lib/types';
import { GENRE_SUGGESTIONS } from '@/lib/genres';

const INTEGRATION_LABEL: Record<string, string> = {
  'apple-music': 'Apple Music',
  spotify: 'Spotify',
  soundcloud: 'Soundcloud',
  'youtube-music': 'Youtube Music',
  'virtual-dj': 'Virtual DJ',
  'pioneer-dj': 'Pioneer DJ',
  tiktok: 'Tik Tok',
  radio: 'Radio',
  files: 'Files',
  'google-drive': 'Google Drive',
};

/** My Creative Controls: how much of the set the crowd can shape and what a request costs. Autosaves. */
const Controls: AuxedPage = () => {
  const toast = useToast();
  const { data } = useApi<{ controls: CreativeControls; integrations: string[] }>('/api/artist/controls');
  const [c, setC] = useState<CreativeControls | null>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [filter, setFilter] = useState('');
  const [ratesOpen, setRatesOpen] = useState(true);
  const [genreSheet, setGenreSheet] = useState<{ index: number | null } | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (data && !c) setC(data.controls);
  }, [data, c]);

  // Debounced autosave.
  useEffect(() => {
    if (!c) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setSaving('saving');
    const t = setTimeout(async () => {
      try {
        await put('/api/artist/controls', c);
        setSaving('saved');
      } catch (err) {
        setSaving('idle');
        toast(errorMessage(err), 'error');
      }
    }, 700);
    return () => clearTimeout(t);
  }, [c, toast]);

  if (!c || !data) return <Loader />;
  const set = <K extends keyof CreativeControls>(k: K, v: CreativeControls[K]) => setC((prev) => (prev ? { ...prev, [k]: v } : prev));

  function addFilter() {
    const w = filter.trim();
    if (!w || !c) return;
    if (!c.micFilters.some((x) => x.toLowerCase() === w.toLowerCase())) set('micFilters', [...c.micFilters, w]);
    setFilter('');
  }

  return (
    <Screen nav theme="green" title="My Creative Controls">
      <TitleBar
        title="My Creative Controls"
        back="/artist"
        right={<span className="font-ui text-[11px] text-white/50">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : ''}</span>}
      />
      <section className="glow-card mx-[6px] rounded-b-none rounded-t-[42px] px-[42px] pb-10 pt-[40px]">
        <Label>Request Intake</Label>
        <Slider value={c.requestIntake} min={0} max={50} onChange={(v) => set('requestIntake', v)} bubble={String(c.requestIntake)} label="Request intake" />

        <div className="mt-9 flex items-center justify-between">
          <Label>Genre Selection</Label>
          <button type="button" aria-label="Add genre" onClick={() => setGenreSheet({ index: null })} className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] bg-black/50 text-white/80">
            <IconPlus size={14} />
          </button>
        </div>
        <div className="mt-2 space-y-5">
          {c.genres.map((g, i) => (
            <Slider
              key={g.name + i}
              value={g.weight}
              min={0}
              max={100}
              label={`${g.name} weight`}
              bubble={g.name}
              onBubble={() => setGenreSheet({ index: i })}
              onChange={(v) => set('genres', c.genres.map((x, j) => (j === i ? { ...x, weight: v } : x)))}
            />
          ))}
          {c.genres.length === 0 && <p className="font-ui text-[12px] text-white/55">Add the genres you play so the crowd knows what to ask for.</p>}
        </div>

        <div className="mt-9">
          <button type="button" onClick={() => setRatesOpen((o) => !o)} aria-expanded={ratesOpen} className="flex items-center gap-1.5 text-left">
            <Label>
              <span className="underline underline-offset-4">Song Length</span> (min)
            </Label>
            <IconCaretDown size={13} className={cx('text-white/70 transition-transform', ratesOpen && 'rotate-180')} />
          </button>
          <div className="relative mt-1">
            <Slider value={c.maxSongLength} min={1} max={15} onChange={(v) => set('maxSongLength', v)} bubble={String(c.maxSongLength)} label="Maximum song length you accept requests for" />
            {ratesOpen && (
              <div
                role="note"
                className="absolute -left-[16px] -top-[2px] animate-fadeIn rounded-[12px] px-5 py-2 text-left font-ui text-[9px] font-semibold leading-[2] text-white shadow-[0_8px_18px_rgba(0,0,0,0.6)]"
                style={{ background: 'linear-gradient(180deg,#2c3f38,#1a2621)' }}
              >
                R{c.ratePerMinShort}/min for songs up to 5 minutes long
                <br />
                R{c.ratePerMinLong}/min for songs longer than 5 minutes
              </div>
            )}
          </div>
          <p className="mt-2 font-ui text-[9px] text-white/50">Slide to the longest song you&apos;ll take a request for. Request rates are set by AUXED.</p>
        </div>

        <div className="-mx-[20px] mt-10 rounded-[18px] bg-black/25 px-[14px] pb-5 pt-4 shadow-[inset_0_0_20px_rgba(0,0,0,0.35)]">
          <Label>On The Mic Requests</Label>
          <div className="mt-3 flex items-center justify-between gap-1">
            {(['NO', 'YES', 'YES_PLUS'] as MicMode[]).map((m, i) => (
              <div key={m} className="contents">
                {i > 0 && <IconSparkle size={18} className="shrink-0 text-white" />}
                <ControlPill active={c.mic === m} onClick={() => set('mic', m)} className={m === 'YES' ? 'w-[110px]' : 'w-[100px]'}>
                  {m === 'NO' ? 'No' : m === 'YES' ? 'Yes' : 'Yes +'}
                </ControlPill>
              </div>
            ))}
          </div>
          {c.mic !== 'NO' && (
            <>
              <div className="mt-4 flex items-center gap-3">
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFilter())}
                  placeholder="Type speech you do not welcome (hate speech, profanity...etc)"
                  className="h-[34px] min-w-0 flex-1 rounded-[10px] bg-black/60 px-3 font-ui text-[9px] text-white outline-none placeholder:text-white/40"
                  aria-label="Word to filter"
                />
                <ControlPill onClick={addFilter} className="w-[94px] !text-[13px]">
                  Add Filter
                </ControlPill>
              </div>
              {c.micFilters.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.micFilters.map((w) => (
                    <button key={w} type="button" onClick={() => set('micFilters', c.micFilters.filter((x) => x !== w))} className="flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 font-ui text-[10px] text-white/80">
                      {w} <IconX size={10} />
                    </button>
                  ))}
                </div>
              )}
              <label className="mt-4 flex items-center justify-between font-ui text-[11px] font-semibold text-white/85">
                On The Mic price (tokens)
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={c.micPrice}
                  onChange={(e) => set('micPrice', Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
                  className="h-[30px] w-[80px] rounded-[10px] bg-black/60 px-2 text-right font-ui text-[12px] text-white outline-none"
                />
              </label>
              {c.mic === 'YES_PLUS' && <p className="mt-2 font-ui text-[10px] text-white/55">Yes + lets the crowd attach a song to their shout-out (mic price + song).</p>}
            </>
          )}
        </div>

        <div className="mt-9">
          <Label>Request Lead Time</Label>
          <div className="-mx-[12px] mt-3 grid grid-cols-4 gap-2">
            {(['LIVE', '24', '48', '36'] as LeadTime[]).map((l) => (
              <ControlPill key={l} active={c.leadTime === l} onClick={() => set('leadTime', l)} className="w-full">
                {l === 'LIVE' ? 'Live' : `${l} hrs`}
              </ControlPill>
            ))}
          </div>
          <p className="-mx-[22px] mt-4 text-center font-ui text-[8px] font-semibold leading-[2] text-white">
            The Request Lead Time lets us determine the best way to connect the audience&apos;s requests to the muse. Dependent on your skill level as an artist and the level of mixing you are comfortable with, the
            control of your creativity really is still yours! The canvas just has multiple artists painting one master piece together on it now.
          </p>
        </div>

        <div className="mt-8">
          <Label>Integrate Software</Label>
          <div className="-mx-[20px] mt-4 flex flex-wrap justify-center gap-x-[10px] gap-y-3">
            {data.integrations.map((key) => {
              const on = c.integrations.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set('integrations', on ? c.integrations.filter((x) => x !== key) : [...c.integrations, key])}
                  className="flex w-[44px] flex-col items-center gap-1"
                >
                  <img src={`/integrations/${key}.png`} alt="" className={cx('h-[40px] w-[40px] object-contain transition', on ? 'opacity-100 drop-shadow-[0_0_8px_rgba(201,241,59,0.6)]' : 'opacity-45 grayscale')} />
                  <span className={cx('whitespace-nowrap font-ui text-[5.5px] font-semibold', on ? 'text-white' : 'text-white/50')}>{INTEGRATION_LABEL[key] ?? key}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center font-ui text-[9px] text-white/45">Selected tools show on your profile. Direct playback sync is coming in a later update.</p>
        </div>
      </section>

      <GenreSheet
        state={genreSheet}
        onClose={() => setGenreSheet(null)}
        current={genreSheet?.index != null ? c.genres[genreSheet.index]?.name : undefined}
        onSave={(name) => {
          if (genreSheet?.index != null) set('genres', c.genres.map((g, i) => (i === genreSheet.index ? { ...g, name } : g)));
          else if (c.genres.length < 8) set('genres', [...c.genres, { name, weight: 50 }]);
          else toast('Pick up to 8 genres.', 'error');
          setGenreSheet(null);
        }}
        onRemove={() => {
          if (genreSheet?.index != null) set('genres', c.genres.filter((_, i) => i !== genreSheet.index));
          setGenreSheet(null);
        }}
      />
    </Screen>
  );
};

function Label({ children }: { children: React.ReactNode }) {
  return <h2 className="font-din text-[15px] font-bold tracking-[0.06em] text-white">{children}</h2>;
}

function Slider({ value, min, max, onChange, bubble, onBubble, label }: { value: number; min: number; max: number; onChange: (v: number) => void; bubble: string; onBubble?: () => void; label: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="relative pt-5">
      <button
        type="button"
        onClick={onBubble}
        tabIndex={onBubble ? 0 : -1}
        className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-[3px] px-2 py-[1px] font-din text-[9.5px] font-bold text-white shadow-[0_0_8px_rgb(var(--accent-soft)/0.45)]"
        style={{ left: `calc(${pct}% + ${(50 - pct) * 0.11}px)`, background: 'linear-gradient(180deg,#6f8f83,#3c5a4f)' }}
      >
        {bubble}
      </button>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="aux-range" aria-label={label} />
    </div>
  );
}

function ControlPill({ children, active, onClick, className }: { children: React.ReactNode; active?: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx('h-[34px] rounded-full font-din text-[15px] font-bold tracking-[0.04em] text-white transition', className)}
      style={{
        background: active ? 'linear-gradient(180deg,#5e8d7c,#2f5a4b)' : 'linear-gradient(180deg,#2c4a3f,#1d332b)',
        boxShadow: active ? '0 0 16px rgb(var(--accent-soft) / 0.55), inset 0 1px 0 rgba(255,255,255,0.3)' : '0 6px 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1)',
      }}
    >
      {children}
    </button>
  );
}

function GenreSheet({ state, onClose, current, onSave, onRemove }: { state: { index: number | null } | null; onClose: () => void; current?: string; onSave: (name: string) => void; onRemove: () => void }) {
  const [name, setName] = useState('');
  useEffect(() => setName(current ?? ''), [current, state]);
  return (
    <Sheet open={!!state} onClose={onClose} title={state?.index != null ? 'Edit genre' : 'Add a genre'}>
      <input className="field" placeholder="Genre" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} aria-label="Genre name" />
      <div className="mt-3 flex flex-wrap gap-2">
        {GENRE_SUGGESTIONS.map((g) => (
          <button key={g} type="button" onClick={() => setName(g)} className="rounded-full bg-white/10 px-3 py-1.5 font-ui text-[12px] text-white/85">
            {g}
          </button>
        ))}
      </div>
      <button type="button" disabled={!name.trim()} onClick={() => onSave(name.trim())} className="glass-pill mt-5 h-[56px] w-full text-[14px] disabled:opacity-50">
        Save
      </button>
      {state?.index != null && (
        <button type="button" onClick={onRemove} className="mt-3 w-full py-2 font-ui text-[13px] font-semibold text-red-300">
          Remove genre
        </button>
      )}
    </Sheet>
  );
}

Controls.auth = ['PERFORMER'];
export default Controls;
