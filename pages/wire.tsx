/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuxedPage } from './_app';
import { Screen } from '@/components/Screen';
import { LogoA } from '@/components/Brand';
import { Sheet } from '@/components/ui';
import { CommentBar } from '@/components/CommentBar';
import { FeaturedPost, FeedCard, MicToFriend, WireRow } from '@/components/WireFeed';
import { StoryRail } from '@/components/Stories';
import { IconPin, IconX } from '@/components/Icons';
import { Skeleton } from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { api, post, errorMessage } from '@/lib/client/api';
import { themeFor, useSession } from '@/lib/client/session';
import { cx } from '@/lib/util';
import type { PostDTO, VenueDTO } from '@/lib/types';

interface Here {
  venue: VenueDTO;
  performanceId: string;
  performerName: string;
  distanceM: number;
}

/**
 * The Wire Room. Out and about it's the social feed (DJ & venue stories, shares, shout-outs).
 * When your phone is at a venue with a live set it becomes that venue's live chat.
 */
const Wire: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const theme = themeFor(user?.role);
  const management = router.query.filter === 'management';
  const [here, setHere] = useState<Here | null>(null);
  const [locState, setLocState] = useState<'unknown' | 'granted' | 'prompt' | 'denied' | 'unsupported'>('unknown');
  const [forceFeed, setForceFeed] = useState(false);
  const venueMode = !!here && !forceFeed && !management;

  const feedPath = management ? '/api/posts?kind=MANAGEMENT' : venueMode ? `/api/posts?performanceId=${here!.performanceId}` : '/api/posts';
  const { data, reload, mutate } = useApi<{ posts: PostDTO[] }>(feedPath, { refreshMs: 6000 });
  const [older, setOlder] = useState<PostDTO[]>([]);
  const [replyTo, setReplyTo] = useState<PostDTO['author'] | null>(null);
  const [more, setMore] = useState(false);
  const [micOpen, setMicOpen] = useState(false);

  const locate = useCallback(() => {
    if (!navigator.geolocation) return setLocState('unsupported');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocState('granted');
        try {
          const r = await api<{ here: Here | null }>(`/api/wire/here?lat=${pos.coords.latitude.toFixed(5)}&lng=${pos.coords.longitude.toFixed(5)}`);
          setHere(r.here);
        } catch {
          /* keep current mode */
        }
      },
      (err) => setLocState(err.code === err.PERMISSION_DENIED ? 'denied' : 'prompt'),
      { maximumAge: 120_000, timeout: 10_000 },
    );
  }, []);

  // Check location automatically if the person already allowed it; re-check every 3 minutes.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      try {
        const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        if (status?.state === 'granted') {
          locate();
          timer = setInterval(locate, 180_000);
        } else setLocState(status?.state === 'denied' ? 'denied' : 'prompt');
      } catch {
        setLocState('prompt');
      }
    })();
    return () => timer && clearInterval(timer);
  }, [locate]);

  useEffect(() => setOlder([]), [feedPath]);

  const all = useMemo(() => {
    const seen = new Set<string>();
    return [...(data?.posts ?? []), ...older].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [data, older]);
  const featured = all.find((p) => (p.kind === 'MIC' || p.kind === 'SNIPPET') && p.imageUrl);
  const rest = all.filter((p) => p !== featured);

  async function send(text: string) {
    try {
      const target = venueMode ? { performanceId: here!.performanceId } : {};
      await post('/api/posts', replyTo ? { kind: 'MIC', text, toUserId: replyTo.id } : { text, ...target });
      setReplyTo(null);
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
      throw err;
    }
  }

  async function like(p: PostDTO) {
    mutate((prev) => ({ posts: (prev?.posts ?? []).map((x) => (x.id === p.id ? { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) } : x)) }));
    try {
      await post(`/api/posts/${p.id}/like`);
    } catch (err) {
      toast(errorMessage(err), 'error');
      reload();
    }
  }

  async function loadOlder() {
    const last = all[all.length - 1];
    if (!last) return;
    try {
      const sep = feedPath.includes('?') ? '&' : '?';
      const r = await api<{ posts: PostDTO[] }>(`${feedPath}${sep}before=${encodeURIComponent(last.createdAt)}`);
      if (!r.posts.length) toast("You've reached the beginning.");
      setOlder((o) => [...o, ...r.posts]);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <Screen nav title="Wire Room" className="!pb-[178px]">
      <div className="flex flex-col items-center pt-[max(56px,calc(env(safe-area-inset-top)+30px))]">
        <LogoA size={64} />
        {management && <p className="mt-3 font-din text-[13px] font-bold uppercase tracking-[0.16em] text-white/80">Hear From Management</p>}
      </div>

      {/* Mode switch */}
      {!management && (
        <div className="mt-4 flex items-center justify-center gap-2 px-4">
          {here ? (
            <div className="flex items-center gap-1 rounded-full bg-black/40 p-1">
              <ModeBtn active={!venueMode} onClick={() => setForceFeed(true)}>
                Wire Room
              </ModeBtn>
              <ModeBtn active={venueMode} onClick={() => setForceFeed(false)}>
                <span className="h-2 w-2 animate-pulseGlow rounded-full bg-red-500" /> {here.venue.name}
              </ModeBtn>
            </div>
          ) : locState === 'prompt' || locState === 'unknown' ? (
            <button type="button" onClick={locate} className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 font-din text-[11px] font-bold uppercase tracking-wider text-white/85">
              <IconPin size={14} /> At a venue? Show its live chat
            </button>
          ) : null}
        </div>
      )}

      {venueMode ? (
        <>
          <Link href={`/sets/${here!.performanceId}`} className="mx-4 mt-4 flex items-center justify-between rounded-[18px] bg-white/[0.06] px-4 py-3">
            <span className="min-w-0">
              <span className="block font-din text-[10px] font-bold uppercase tracking-[0.16em] text-lime">You&apos;re at</span>
              <span className="block truncate font-din text-[15px] font-bold uppercase tracking-wide text-white">
                {here!.venue.name} · {here!.performerName}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-lime px-3 py-1.5 font-din text-[10px] font-bold uppercase tracking-wider text-lime-ink">Request queue</span>
          </Link>
          {featured && <FeaturedPost p={featured} onLike={() => like(featured)} />}
          <ul className="mt-5 flex flex-col gap-[10px] px-3">
            {!data && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[62px]" />)}
            {rest.map((p) => (
              <WireRow key={p.id} p={p} onReply={() => setReplyTo(p.author)} meId={user?.id} />
            ))}
            {data && all.length === 0 && <p className="py-10 text-center font-ui text-sm text-white/60">Be the first to say something in {here!.venue.chatLabel.toLowerCase()}.</p>}
          </ul>
        </>
      ) : (
        <>
          {!management && <StoryRail className="mt-5" />}
          {featured && <FeaturedPost p={featured} onLike={() => like(featured)} />}
          <ul className="mt-5 flex flex-col gap-3 px-3">
            {!data && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[120px]" />)}
            {rest.map((p) => (
              <FeedCard key={p.id} p={p} meId={user?.id} onLike={() => like(p)} onReply={p.to || p.kind === 'MIC' ? () => setReplyTo(p.author) : undefined} />
            ))}
            {data && all.length === 0 && <p className="py-10 text-center font-ui text-sm text-white/60">The Wire Room is quiet. Say hi 👋</p>}
          </ul>
        </>
      )}
      {all.length >= 40 && (
        <button type="button" onClick={loadOlder} className="mx-auto mt-4 block rounded-full bg-white/10 px-5 py-2 font-din text-[12px] font-bold uppercase tracking-wider text-white/80">
          Load older
        </button>
      )}

      <div className="fixed inset-x-0 bottom-[104px] z-30 mx-auto max-w-[var(--app-w)] px-4">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded-full bg-black/70 px-4 py-1.5 font-ui text-[12px] text-white/80 backdrop-blur">
            <span>
              Private reply to <b>{replyTo.userName}</b> On The Mic
            </span>
            <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>
              <IconX size={14} />
            </button>
          </div>
        )}
        <CommentBar
          tone={theme === 'green' ? 'green' : theme === 'purple' ? 'purple' : 'blue'}
          placeholder={replyTo ? `Reply to ${replyTo.userName}` : venueMode ? `Message ${here!.venue.chatLabel.toLowerCase()}` : 'Add Comment'}
          onSend={send}
          onRequest={() => router.push(venueMode ? `/sets/${here!.performanceId}?request=1` : '/request')}
          onCamera={() => router.push(venueMode ? `/snippet?performanceId=${here!.performanceId}` : '/snippet')}
          onMore={() => setMore(true)}
        />
      </div>

      <Sheet open={more} onClose={() => setMore(false)} title="Wire Room">
        <div className="flex flex-col gap-2 pb-2">
          <MoreBtn onClick={() => (setMore(false), setMicOpen(true))}>Send a friend something On The Mic</MoreBtn>
          <MoreBtn onClick={() => router.push('/pass')}>Start a PASS THE AUX session</MoreBtn>
          <MoreBtn onClick={() => router.push('/snippet')}>Post a pic snippet</MoreBtn>
          <MoreBtn onClick={() => router.push('/treasure')}>My Treasure Box</MoreBtn>
          {here && <MoreBtn onClick={() => (setMore(false), setForceFeed((f) => !f))}>{venueMode ? 'Show the Wire Room feed' : `Back to ${here.venue.name} chat`}</MoreBtn>}
        </div>
      </Sheet>
      <MicToFriend open={micOpen} onClose={() => setMicOpen(false)} onSent={reload} />
    </Screen>
  );
};

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('flex max-w-[180px] items-center gap-1.5 truncate rounded-full px-4 py-1.5 font-din text-[11px] font-bold uppercase tracking-wider transition', active ? 'bg-lime text-lime-ink' : 'text-white/75')}
    >
      {children}
    </button>
  );
}

function MoreBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl bg-white/[0.07] px-5 py-4 text-left font-ui text-[15px] font-semibold text-white">
      {children}
    </button>
  );
}

Wire.auth = true;
export default Wire;
