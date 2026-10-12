/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useState } from 'react';
import type { AuxedPage } from './_app';
import { Screen, TitleBar } from '@/components/Screen';
import { Avatar, EmptyState, TabPills } from '@/components/ui';
import { RequestCard } from '@/components/RequestCard';
import { ShareToFriendSheet } from '@/components/WireFeed';
import { IconHeart, IconNote, IconShare } from '@/components/Icons';
import { Skeleton } from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { del, errorMessage } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import { duration, timeAgo } from '@/lib/format';
import { cx } from '@/lib/util';
import type { PerformanceBrief, PostDTO, RequestDTO, Track } from '@/lib/types';
import type { FavoriteDTO } from '@/lib/server/services/favorites';

interface TreasureData {
  mics: RequestDTO[];
  posts: PostDTO[];
  favorites: FavoriteDTO[];
  likedSets: PerformanceBrief[];
}

const TABS = ['Favourites', 'From Friends', 'Imported', 'Moments'] as const;
type Tab = (typeof TABS)[number];
const SOURCE_ICON: Record<string, string> = { SPOTIFY: '/integrations/spotify.png', APPLE_MUSIC: '/integrations/apple-music.png' };
const SOURCE_LABEL: Record<string, string> = { SPOTIFY: 'Spotify', APPLE_MUSIC: 'Apple Music', AUXED: 'Saved on AUXED', FRIEND: 'From a friend' };

/** My Treasure Box: saved songs and sets, what friends sent you, imports from your music apps and your On The Mic moments. */
const Treasure: AuxedPage = () => {
  const toast = useToast();
  const { user } = useSession();
  const { data, reload } = useApi<TreasureData>('/api/me/treasure');
  const [tab, setTab] = useState<Tab>('Favourites');
  const [share, setShare] = useState<{ track?: Track | null; performanceId?: string | null; title: string } | null>(null);

  const favs = data?.favorites ?? [];
  const saved = favs.filter((f) => f.source === 'AUXED');
  const fromFriends = favs.filter((f) => f.source === 'FRIEND');
  const imported = favs.filter((f) => f.source === 'SPOTIFY' || f.source === 'APPLE_MUSIC');
  const toMe = data?.posts.filter((p) => p.to?.id === user?.id) ?? [];
  const mine = data?.posts.filter((p) => p.author.id === user?.id) ?? [];

  async function remove(f: FavoriteDTO) {
    try {
      await del(`/api/me/favorites?id=${f.id}`);
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <Screen nav title="My Treasure Box">
      <TitleBar title="My Treasure Box" back />
      <TabPills tabs={TABS} value={tab} onChange={setTab} className="-mt-2 mb-4" />

      {!data && (
        <div className="space-y-3 px-4">
          <Skeleton className="h-[86px]" />
          <Skeleton className="h-[86px]" />
        </div>
      )}

      {data && tab === 'Favourites' && (
        <>
          <Section title="Saved songs">
            {saved.filter((f) => f.kind === 'TRACK').map((f) => (
              <FavTrack key={f.id} f={f} onRemove={() => remove(f)} onShare={() => setShare({ track: f.track, title: f.track?.title ?? 'song' })} />
            ))}
            {!saved.some((f) => f.kind === 'TRACK') && <Hint>Tap a song in any set&apos;s queue and choose “Save to my Treasure Box”.</Hint>}
          </Section>
          <Section title="Favourite sets">
            {[...saved.filter((f) => f.kind === 'SET' && f.set).map((f) => f.set!), ...data.likedSets.filter((s) => !saved.some((f) => f.set?.id === s.id))].map((s) => (
              <SetRow key={s.id} s={s} onShare={() => setShare({ performanceId: s.id, title: s.title })} />
            ))}
            {!saved.some((f) => f.kind === 'SET') && !data.likedSets.length && <Hint>Tap ♥ under a set to keep it here.</Hint>}
          </Section>
        </>
      )}

      {data && tab === 'From Friends' && (
        <Section title="Shared with you">
          {fromFriends.map((f) =>
            f.kind === 'TRACK' ? (
              <FavTrack key={f.id} f={f} onRemove={() => remove(f)} onShare={() => setShare({ track: f.track, title: f.track?.title ?? 'song' })} />
            ) : (
              <div key={f.id}>
                <FromLine f={f} />
                {f.set && <SetRow s={f.set} />}
              </div>
            ),
          )}
          {toMe.map((p) => (
            <PostItem key={p.id} p={p} />
          ))}
          {!fromFriends.length && !toMe.length && <Hint>When friends send you a song, a set or something On The Mic, it lands here.</Hint>}
        </Section>
      )}

      {data && tab === 'Imported' && (
        <Section title="From your music apps">
          {imported.map((f) => (
            <FavTrack key={f.id} f={f} onRemove={() => remove(f)} onShare={() => setShare({ track: f.track, title: f.track?.title ?? 'song' })} />
          ))}
          {!imported.length && <Hint>Connect Apple Music or Spotify to bring your favourites in — they power your quick-request picks.</Hint>}
          <Link href="/profile#music" className="mt-1 block rounded-2xl bg-white/[0.06] px-4 py-3 text-center font-din text-[12px] font-bold uppercase tracking-wider text-white/80">
            Manage music connections
          </Link>
        </Section>
      )}

      {data && tab === 'Moments' && (
        <>
          {data.mics.length > 0 && (
            <Section title="On The Mic">
              {data.mics.map((r) => (
                <Link key={r.id} href={`/sets/${r.performanceId}`} className="block">
                  <RequestCard r={r} compactLayout />
                </Link>
              ))}
            </Section>
          )}
          {mine.length > 0 && (
            <Section title="Snippets & shout-outs">
              {mine.map((p) => (
                <PostItem key={p.id} p={p} />
              ))}
            </Section>
          )}
          {!data.mics.length && !mine.length && (
            <EmptyState
              title="No moments yet"
              body="Go On The Mic at a set or post a pic snippet — your moments are kept here."
              action={
                <Link href="/request" className="rounded-full bg-lime px-5 py-2.5 font-din text-[13px] font-bold uppercase text-lime-ink">
                  Find a live set
                </Link>
              }
            />
          )}
        </>
      )}

      {share && <ShareToFriendSheet open onClose={() => setShare(null)} track={share.track} performanceId={share.performanceId} title={share.title} />}
    </Screen>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-7 font-din text-[14px] font-bold uppercase tracking-[0.1em] text-white/75">{title}</h2>
      <div className="space-y-3 px-4">{children}</div>
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-white/[0.04] px-4 py-3 font-ui text-[13px] text-white/55">{children}</p>;
}

function FromLine({ f }: { f: FavoriteDTO }) {
  if (!f.from) return null;
  return (
    <p className="mb-1.5 flex items-center gap-2 px-1 font-ui text-[12px] text-white/70">
      <Avatar src={f.from.avatarUrl} name={f.from.userName} size={20} ring={f.from.ring} />
      <b className="text-white">{f.from.userName}</b> {f.note ? `· “${f.note}”` : 'shared this'} · {timeAgo(f.createdAt)}
    </p>
  );
}

function FavTrack({ f, onRemove, onShare }: { f: FavoriteDTO; onRemove: () => void; onShare: () => void }) {
  const t = f.track;
  if (!t) return null;
  return (
    <div>
      {f.source === 'FRIEND' && <FromLine f={f} />}
      <div className="panel flex items-center gap-3 p-2.5 pr-3">
        {t.artwork ? <img src={t.artwork.replace('600x600', '160x160')} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" loading="lazy" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-black/40 text-white/60"><IconNote size={20} /></span>}
        <div className="min-w-0 flex-1">
          <p className="truncate font-din text-[14px] font-bold uppercase tracking-wide text-white">{t.title}</p>
          <p className="truncate font-ui text-[12px] text-white/65">
            {t.artist} · {duration(t.durationSec)}
          </p>
          <p className="mt-0.5 flex items-center gap-1 font-din text-[9.5px] font-bold uppercase tracking-wider text-white/50">
            {SOURCE_ICON[f.source] && <img src={SOURCE_ICON[f.source]} alt="" className="h-3.5 w-3.5 rounded-[3px]" />}
            {SOURCE_LABEL[f.source]}
          </p>
        </div>
        <button type="button" aria-label="Send to a friend" onClick={onShare} className="p-1.5 text-white/70">
          <IconShare size={18} />
        </button>
        <button type="button" aria-label="Remove" onClick={onRemove} className={cx('p-1.5', f.source === 'AUXED' ? 'text-[#ff2d3d]' : 'text-white/40')}>
          <IconHeart size={18} />
        </button>
      </div>
    </div>
  );
}

function SetRow({ s, onShare }: { s: Pick<PerformanceBrief, 'id' | 'title' | 'status' | 'imageUrl' | 'performer' | 'venue'>; onShare?: () => void }) {
  return (
    <div className="relative">
      <Link href={`/sets/${s.id}`} className="relative flex h-[84px] items-center gap-3 overflow-hidden rounded-[20px] bg-black/40 px-3">
        {(s.imageUrl ?? s.venue.imageUrl) && <img src={(s.imageUrl ?? s.venue.imageUrl)!} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" loading="lazy" />}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 to-black/30" />
        <span className="relative min-w-0 flex-1">
          <span className="block truncate font-din text-[15px] font-bold uppercase tracking-wide text-white">{s.performer.name}</span>
          <span className="block truncate font-ui text-[12px] text-white/70">
            {s.venue.name} · {s.status === 'LIVE' ? 'Live now' : s.status === 'UPCOMING' ? 'Upcoming' : 'Replay the set'}
          </span>
        </span>
      </Link>
      {onShare && (
        <button type="button" aria-label="Send to a friend" onClick={onShare} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80">
          <IconShare size={16} />
        </button>
      )}
    </div>
  );
}

function PostItem({ p }: { p: PostDTO }) {
  return (
    <article className="panel p-4">
      <div className="flex items-center gap-3">
        <Avatar src={p.author.avatarUrl} name={p.author.userName} size={36} ring={p.author.ring} />
        <p className="flex-1 font-ui text-[13px] text-white/70">
          <b className="text-white">{p.author.userName}</b>
          {p.to ? ` → ${p.to.userName}` : ''} · {timeAgo(p.createdAt)}
        </p>
      </div>
      {p.text && <p className="mt-2 font-ui text-[14px] text-white/90">{p.kind === 'MIC' ? `“${p.text}”` : p.text}</p>}
      {p.caption && <p className="mt-1 font-ui text-[12px] text-white/60">{p.caption}</p>}
      {p.imageUrl && <img src={p.imageUrl} alt="" className="mt-3 max-h-[320px] w-full rounded-[18px] object-cover" loading="lazy" />}
      {p.nowPlaying && <p className="mt-2 font-din text-[11px] text-white/60">♪ {p.nowPlaying}</p>}
    </article>
  );
}

Treasure.auth = true;
export default Treasure;
