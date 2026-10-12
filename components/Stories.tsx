/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/lib/client/useApi';
import { del, post, errorMessage } from '@/lib/client/api';
import { prepareImage, uploadImage } from '@/lib/client/image';
import { useSession } from '@/lib/client/session';
import { compact, timeAgo } from '@/lib/format';
import { cx } from '@/lib/util';
import type { PerformanceBrief, RequestDTO, StoryDTO, StoryGroupDTO } from '@/lib/types';
import { Avatar, Sheet, TabPills } from './ui';
import { IconCamera, IconPlus, IconX } from './Icons';
import { useToast } from './Toast';

const RING_UNSEEN = 'conic-gradient(from 210deg, #D0FF34, #6683FF, #C856E0, #FF4FA3, #D0FF34)';

/** Instagram-style story circles: DJs' and venues' highlights from the day. */
export function StoryRail({ className }: { className?: string }) {
  const { user } = useSession();
  const { data, reload, mutate } = useApi<{ groups: StoryGroupDTO[] }>('/api/stories', { refreshMs: 60_000 });
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const canPost = user?.role === 'PERFORMER' || user?.role === 'OWNER' || user?.role === 'ADMIN';
  const groups = data?.groups ?? [];
  const mineIdx = groups.findIndex((g) => g.mine);

  const markSeen = useCallback(
    (storyId: string) => {
      if (!user) return;
      post(`/api/stories/${storyId}/view`).catch(() => undefined);
      mutate((prev) =>
        prev
          ? {
              groups: prev.groups.map((g) => {
                const stories = g.stories.map((s) => (s.id === storyId ? { ...s, viewed: true } : s));
                return { ...g, stories, seen: g.mine ? g.seen : stories.every((s) => s.viewed) };
              }),
            }
          : prev!,
      );
    },
    [user, mutate],
  );

  if (data && !groups.length && !canPost) return null;

  return (
    <>
      <div className={cx('no-scrollbar flex gap-3.5 overflow-x-auto px-4 pb-1 pt-1', className)}>
        {canPost && mineIdx < 0 && (
          <button type="button" onClick={() => setAdding(true)} className="flex w-[74px] shrink-0 flex-col items-center gap-1.5">
            <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full bg-white/10 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.25)]">
              <Avatar src={user?.avatarUrl} name={user?.userName} size={62} ring="transparent" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-lime text-lime-ink shadow">
                <IconPlus size={13} strokeWidth={3.6} />
              </span>
            </span>
            <span className="w-full truncate text-center font-din text-[10px] font-bold tracking-wide text-white/85">Your story</span>
          </button>
        )}
        {groups.map((g, i) => (
          <button key={g.key} type="button" onClick={() => setOpen(i)} className="flex w-[74px] shrink-0 flex-col items-center gap-1.5">
            <span className="relative rounded-full p-[3px]" style={{ background: g.seen && !g.mine ? 'rgba(255,255,255,0.22)' : RING_UNSEEN }}>
              <span className="block rounded-full bg-black p-[2.5px]">
                <span className="block h-[60px] w-[60px] overflow-hidden rounded-full bg-[#1b1b22]">
                  {g.imageUrl ? <img src={g.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="flex h-full items-center justify-center font-din font-bold text-white/70">{g.name.slice(0, 2)}</span>}
                </span>
              </span>
              {g.mine && canPost && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Add to your story"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAdding(true);
                  }}
                  className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-lime text-lime-ink shadow"
                >
                  <IconPlus size={13} strokeWidth={3.6} />
                </span>
              )}
            </span>
            <span className="w-full truncate text-center font-din text-[10px] font-bold tracking-wide text-white/85">{g.mine ? 'Your story' : g.name}</span>
          </button>
        ))}
        {!data && [0, 1, 2, 3, 4].map((i) => <span key={i} className="h-[70px] w-[70px] shrink-0 animate-pulse rounded-full bg-white/10" />)}
      </div>
      {open !== null && groups[open] && (
        <StoryViewer
          groups={groups}
          start={open}
          onClose={() => {
            setOpen(null);
            reload();
          }}
          onSeen={markSeen}
          onDeleted={reload}
        />
      )}
      <AddStorySheet open={adding} onClose={() => setAdding(false)} onPosted={reload} />
    </>
  );
}

const DURATION = 6000;

export function StoryViewer({
  groups,
  start,
  onClose,
  onSeen,
  onDeleted,
}: {
  groups: StoryGroupDTO[];
  start: number;
  onClose: () => void;
  onSeen: (id: string) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [gi, setGi] = useState(start);
  const [si, setSi] = useState(() => Math.max(0, groups[start].stories.findIndex((s) => !s.viewed)));
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const startedAt = useRef(Date.now());
  const elapsedBeforePause = useRef(0);
  const g = groups[gi];
  const story = g?.stories[si];

  const next = useCallback(() => {
    if (!g) return onClose();
    if (si < g.stories.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) {
      setGi(gi + 1);
      setSi(Math.max(0, groups[gi + 1].stories.findIndex((s) => !s.viewed)));
    } else onClose();
  }, [g, gi, si, groups, onClose]);
  const prev = () => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) {
      setGi(gi - 1);
      setSi(0);
    }
  };

  useEffect(() => {
    if (!story) return;
    onSeen(story.id);
    startedAt.current = Date.now();
    elapsedBeforePause.current = 0;
    setProgress(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  useEffect(() => {
    if (paused) {
      elapsedBeforePause.current += Date.now() - startedAt.current;
      return;
    }
    startedAt.current = Date.now();
    const t = setInterval(() => {
      const p = (elapsedBeforePause.current + Date.now() - startedAt.current) / DURATION;
      if (p >= 1) next();
      else setProgress(p);
    }, 50);
    return () => clearInterval(t);
  }, [paused, next, story?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  });

  if (!g || !story) return null;

  async function remove() {
    if (!story || !confirm('Delete this story?')) return;
    try {
      await del(`/api/stories/${story.id}`);
      toast('Story deleted.');
      onDeleted();
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <div className="fixed inset-0 z-[80] mx-auto flex max-w-[var(--app-w)] flex-col bg-black" role="dialog" aria-modal="true" aria-label={`${g.name} story`}>
      <StoryContent s={story} />
      {/* tap zones */}
      <button type="button" aria-label="Previous" className="absolute inset-y-0 left-0 z-10 w-1/3" onClick={prev} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} />
      <button type="button" aria-label="Next" className="absolute inset-y-0 right-0 z-10 w-2/3" onClick={next} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} />
      <div className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/70 to-transparent px-3 pb-8 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex gap-1">
          {g.stories.map((s, i) => (
            <span key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
              <span className="block h-full bg-white" style={{ width: i < si ? '100%' : i === si ? `${progress * 100}%` : '0%' }} />
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="h-9 w-9 overflow-hidden rounded-full bg-white/10">{g.imageUrl && <img src={g.imageUrl} alt="" className="h-full w-full object-cover" />}</span>
          <span className="font-ui text-[14px] font-semibold text-white">{g.name}</span>
          <span className="font-ui text-[12px] text-white/60">{timeAgo(story.createdAt)}</span>
          <span className="ml-auto flex items-center gap-3">
            {story.mine && (
              <button type="button" onClick={remove} className="relative z-30 font-din text-[11px] font-bold uppercase tracking-wider text-white/80">
                Delete · {story.views ?? 0} views
              </button>
            )}
            <button type="button" aria-label="Close" onClick={onClose} className="relative z-30 p-1 text-white">
              <IconX size={22} />
            </button>
          </span>
        </div>
      </div>
      {(story.set || story.request) && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-[max(28px,env(safe-area-inset-bottom))]">
          <Link
            href={`/sets/${story.set?.id}`}
            className="flex h-[54px] w-full items-center justify-center rounded-full bg-lime font-din text-[14px] font-bold uppercase tracking-[0.12em] text-lime-ink shadow-[0_0_24px_rgba(208,255,52,0.45)]"
          >
            {story.set?.status === 'LIVE' ? (story.kind === 'REQUEST' ? 'Upvote it in the set' : 'Join the set') : 'See the set'}
          </Link>
        </div>
      )}
    </div>
  );
}

function StoryContent({ s }: { s: StoryDTO }) {
  if (s.kind === 'PHOTO') {
    return (
      <div className="relative flex-1">
        {s.imageUrl && <img src={s.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/70" />
        {s.text && <p className="absolute inset-x-6 bottom-[110px] text-center font-ui text-[20px] font-semibold leading-snug text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">{s.text}</p>}
      </div>
    );
  }
  if (s.kind === 'TEXT') {
    return (
      <div className="flex flex-1 items-center justify-center px-8" style={{ background: 'radial-gradient(120% 80% at 30% 20%, rgb(var(--accent)) 0%, rgb(var(--accent-deep)) 55%, #000 100%)' }}>
        <p className="semi-x text-center font-wide text-[28px] font-extrabold leading-tight text-white">{s.text}</p>
      </div>
    );
  }
  if (s.kind === 'REQUEST' && s.request) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center px-8">
        {s.request.artwork && <img src={s.request.artwork} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-2xl" />}
        <div className="absolute inset-0 bg-black/40" />
        <p className="relative mb-4 font-din text-[12px] font-bold uppercase tracking-[0.2em] text-lime">Request highlight · {s.set?.venueName}</p>
        {s.request.artwork ? (
          <img src={s.request.artwork} alt="" className="relative h-[260px] w-[260px] rounded-[24px] object-cover shadow-[0_20px_60px_rgba(0,0,0,0.6)]" />
        ) : (
          <div className="relative flex h-[200px] w-[260px] items-center justify-center rounded-[24px] bg-white/10 p-6 text-center font-ui text-[18px] text-white">“{s.request.message}”</div>
        )}
        <p className="relative mt-6 text-center font-din text-[24px] font-bold uppercase tracking-wide text-white">{s.request.kind === 'MIC' ? 'On The Mic' : s.request.title}</p>
        <p className="relative font-ui text-[15px] text-white/80">{s.request.artist}</p>
        <p className="relative mt-3 font-din text-[13px] font-bold uppercase tracking-wider text-white">
          ▲ {compact(s.request.up, true)} · requested by {s.request.requestedBy}
        </p>
      </div>
    );
  }
  // SET
  const set = s.set!;
  return (
    <div className="relative flex flex-1 flex-col justify-end px-6 pb-[120px]">
      {set.imageUrl && <img src={set.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/90" />
      <div className="relative">
        {set.status === 'LIVE' && (
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 font-din text-[11px] font-bold uppercase tracking-wider text-white">
            <span className="h-2 w-2 animate-pulseGlow rounded-full bg-white" /> Live now
          </span>
        )}
        <p className="font-din text-[13px] font-bold uppercase tracking-[0.18em] text-white/80">{set.performerName}</p>
        <p className="semi-x font-wide text-[34px] font-black uppercase leading-[0.95] text-white">{set.venueName}</p>
        {set.nowPlaying && (
          <p className="mt-3 font-din text-[13px] font-bold uppercase tracking-[0.12em] text-white">
            ♪ {set.nowPlaying.track.title} — {set.nowPlaying.track.artist}
          </p>
        )}
        {s.text && <p className="mt-2 font-ui text-[15px] text-white/90">{s.text}</p>}
      </div>
    </div>
  );
}

const ADD_TABS = ['Live set', 'Request', 'Photo', 'Text'] as const;

export function AddStorySheet({ open, onClose, onPosted, initial }: { open: boolean; onClose: () => void; onPosted: () => void; initial?: { tab?: (typeof ADD_TABS)[number]; performanceId?: string; requestId?: string } }) {
  const toast = useToast();
  const [tab, setTab] = useState<(typeof ADD_TABS)[number]>(initial?.tab ?? 'Live set');
  const { data } = useApi<{ sets: PerformanceBrief[]; requests: RequestDTO[] }>(open ? '/api/stories/shareable' : null);
  const [setId, setSetId] = useState<string | null>(initial?.performanceId ?? null);
  const [reqId, setReqId] = useState<string | null>(initial?.requestId ?? null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && initial?.tab) setTab(initial.tab);
    if (open && initial?.performanceId) setSetId(initial.performanceId);
    if (open && initial?.requestId) setReqId(initial.requestId);
  }, [open, initial?.tab, initial?.performanceId, initial?.requestId]);

  async function submit() {
    setBusy(true);
    try {
      if (tab === 'Live set') await post('/api/stories', { kind: 'SET', performanceId: setId, text: text || null });
      else if (tab === 'Request') await post('/api/stories', { kind: 'REQUEST', requestId: reqId });
      else if (tab === 'Photo') {
        if (!file) throw new Error('Add a photo.');
        const imageUrl = await uploadImage(await prepareImage(file, { maxDim: 1440 }));
        await post('/api/stories', { kind: 'PHOTO', imageUrl, text: text || null });
      } else await post('/api/stories', { kind: 'TEXT', text });
      toast('Added to your story.', 'success');
      setText('');
      setFile(null);
      onPosted();
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  const ready = tab === 'Live set' ? !!setId : tab === 'Request' ? !!reqId : tab === 'Photo' ? !!file : text.trim().length > 0;

  return (
    <Sheet open={open} onClose={onClose} title="Add to your story">
      <TabPills tabs={ADD_TABS} value={tab} onChange={setTab} className="mb-3 justify-center" />
      {tab === 'Live set' && (
        <div className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto">
          {data?.sets.map((s) => (
            <button key={s.id} type="button" onClick={() => setSetId(s.id)} className={cx('flex items-center gap-3 rounded-2xl p-2 text-left', setId === s.id ? 'bg-lime/20 ring-1 ring-lime' : 'bg-white/[0.06]')}>
              {(s.imageUrl ?? s.venue.imageUrl) && <img src={(s.imageUrl ?? s.venue.imageUrl)!} alt="" className="h-12 w-12 rounded-xl object-cover" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-din text-[14px] font-bold uppercase text-white">{s.title}</span>
                <span className="block truncate font-ui text-[12px] text-white/60">
                  {s.venue.name} · {s.status === 'LIVE' ? 'Live now' : s.status === 'UPCOMING' ? 'Upcoming' : 'Earlier today'}
                </span>
              </span>
            </button>
          ))}
          {data && !data.sets.length && <p className="py-4 text-center font-ui text-[13px] text-white/60">No sets from today to share yet.</p>}
        </div>
      )}
      {tab === 'Request' && (
        <div className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto">
          {data?.requests.map((r) => (
            <button key={r.id} type="button" onClick={() => setReqId(r.id)} className={cx('flex items-center gap-3 rounded-2xl p-2 text-left', reqId === r.id ? 'bg-lime/20 ring-1 ring-lime' : 'bg-white/[0.06]')}>
              {r.track?.artwork ? <img src={r.track.artwork.replace('600x600', '100x100')} alt="" className="h-12 w-12 rounded-xl object-cover" /> : <span className="h-12 w-12 rounded-xl bg-white/10" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-din text-[14px] font-bold uppercase text-white">{r.kind === 'MIC' ? `“${r.message}”` : r.track?.title}</span>
                <span className="block truncate font-ui text-[12px] text-white/60">
                  {r.track?.artist ?? 'On The Mic'} · ▲ {compact(r.up, true)} · by {r.user.userName}
                </span>
              </span>
            </button>
          ))}
          {data && !data.requests.length && <p className="py-4 text-center font-ui text-[13px] text-white/60">No requests to highlight yet.</p>}
        </div>
      )}
      {tab === 'Photo' && (
        <>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex h-[180px] w-full items-center justify-center overflow-hidden rounded-[20px] bg-black/40">
            {file ? <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" /> : <IconCamera size={36} className="text-white/60" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </>
      )}
      {(tab === 'Text' || tab === 'Photo' || tab === 'Live set') && (
        <textarea className="field-area mt-3 min-h-[80px]" maxLength={200} placeholder={tab === 'Text' ? 'Say something to your crowd…' : 'Add a caption (optional)'} value={text} onChange={(e) => setText(e.target.value)} />
      )}
      <button type="button" disabled={!ready || busy} onClick={submit} className="glass-pill mt-4 h-[56px] w-full text-[14px] disabled:opacity-50">
        {busy ? 'Posting…' : 'Share to your story'}
      </button>
      <p className="mt-2 text-center font-ui text-[11px] text-white/45">Stories disappear after 24 hours.</p>
    </Sheet>
  );
}
