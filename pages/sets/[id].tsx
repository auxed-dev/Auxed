/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { Screen } from '@/components/Screen';
import { ErrorNote, Marquee, Sheet } from '@/components/ui';
import { RequestCard, RequestSlot } from '@/components/RequestCard';
import { RequestSheet } from '@/components/RequestSheet';
import { CommentBar } from '@/components/CommentBar';
import { VenueLogo } from '@/components/VenueLogo';
import { LogoA } from '@/components/Brand';
import { FeaturedPost, ShareToFriendSheet, WireRow } from '@/components/WireFeed';
import { AddStorySheet } from '@/components/Stories';
import { InviteSheet, MembersSheet, SessionHeader, SessionSettingsSheet, ShareSessionSheet } from '@/components/Session';
import { IconBack, IconHeart, IconPlay, IconShare, IconSkip, IconSos, IconStop } from '@/components/Icons';
import { Loader } from '@/components/Loader';
import { AuxInCard, AutoQueueSheet, NowPlayingReactions } from '@/components/RoomExtras';
import { enablePush } from '@/lib/client/push';
import { isNativeApp, startLiveCard } from '@/lib/client/native';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { post, errorMessage, ApiError } from '@/lib/client/api';
import { themeFor, useSession } from '@/lib/client/session';
import { clock, compact } from '@/lib/format';
import type { PostDTO, RequestDTO, RoomDTO, Track } from '@/lib/types';

/** A set's room (or a PASS THE AUX session): who's playing, the request queue and the chat. */
export default function SetRoom() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const { data: room, error, reload, mutate } = useApi<RoomDTO>(id ? `/api/performances/${id}` : null, { refreshMs: 5000 });
  const { data: favs, reload: reloadFavs } = useApi<{ keys: string[] }>(user ? '/api/me/favorites?keys=1' : null);
  const [sheet, setSheet] = useState<null | 'Song' | 'On The Mic'>(null);
  const [panel, setPanel] = useState<null | 'chat' | 'more' | 'invite' | 'members' | 'settings' | 'shareSession' | 'autoqueue'>(null);
  const [trackMenu, setTrackMenu] = useState<{ track: Track; request?: RequestDTO } | null>(null);
  const [friendShare, setFriendShare] = useState<{ track?: Track | null; performanceId?: string | null; title: string } | null>(null);
  const [story, setStory] = useState<null | { tab: 'Live set' | 'Request'; requestId?: string }>(null);
  const [sosTip, setSosTip] = useState(true);
  const [code, setCode] = useState('');

  // A "request" link (QR code, lock-screen card) opens the sheet once, then the link is consumed so
  // the room refreshing (every few seconds, and after a request) doesn't keep reopening it.
  const roomReady = !!room;
  useEffect(() => {
    if (router.query.request !== '1' || !roomReady || !user) return;
    setSheet('Song');
    const { request: _consumed, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
  }, [router, roomReady, user]);

  useEffect(() => {
    const t = setTimeout(() => setSosTip(false), 6000);
    return () => clearTimeout(t);
  }, []);

  const theme = themeFor(user?.role);
  const home = !!room?.session;
  const manage = !!room && (room.isPerformer || room.isOwner);
  const performerView = theme === 'green' && !home;
  const tone = theme === 'green' ? 'green' : theme === 'purple' ? 'purple' : 'blue';
  const favKeys = useMemo(() => new Set(favs?.keys ?? []), [favs]);
  const isFav = (t: Track) => favKeys.has(`${t.title}|${t.artist}`.toLowerCase());

  const requireLogin = () => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(router.asPath)}`);
      return true;
    }
    return false;
  };

  async function vote(r: RequestDTO, value: 1 | -1) {
    if (requireLogin()) return;
    const next = r.myVote === value ? 0 : value;
    mutate((prev) =>
      prev
        ? {
            ...prev,
            queue: prev.queue.map((q) =>
              q.id === r.id
                ? { ...q, myVote: next as 0 | 1 | -1, up: q.up - (q.myVote === 1 ? 1 : 0) + (next === 1 ? 1 : 0), down: q.down - (q.myVote === -1 ? 1 : 0) + (next === -1 ? 1 : 0) }
                : q,
            ),
          }
        : prev!,
    );
    try {
      await post(`/api/requests/${r.id}/vote`, { value });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
    reload();
  }

  async function react(r: RequestDTO, emoji: string) {
    if (requireLogin()) return;
    try {
      await post(`/api/requests/${r.id}/react`, { emoji });
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function decide(r: RequestDTO, action: 'approve' | 'reject' | 'play') {
    try {
      await post(`/api/requests/${r.id}/decision`, { action });
      toast(action === 'approve' ? 'Added to the queue.' : action === 'reject' ? (r.priceCents > 0 ? 'Declined — tokens refunded.' : 'Removed from the queue.') : 'Playing now.', 'success');
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function control(action: 'golive' | 'skip' | 'end') {
    if (action === 'end' && !confirm(home ? 'End the session for everyone?' : 'End this set? Requests that have not played yet will be refunded.')) return;
    try {
      await post(`/api/performances/${id}/control`, { action });
      toast(action === 'golive' ? "You're live!" : action === 'skip' ? 'Skipped.' : home ? 'Session ended.' : 'Set ended.', 'success');
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function sendChat(text: string) {
    if (requireLogin()) return;
    try {
      await post('/api/posts', { performanceId: id, text });
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
      throw err;
    }
  }

  async function like() {
    if (requireLogin() || !room) return;
    try {
      await post(`/api/performances/${room.performance.id}/like`);
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function likePost(p: PostDTO) {
    try {
      await post(`/api/posts/${p.id}/like`);
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function toggleFavorite(track: Track) {
    if (requireLogin()) return;
    try {
      const r = await post<{ favorited: boolean }>('/api/me/favorites', { track, performanceId: id });
      toast(r.favorited ? 'Saved to your Treasure Box.' : 'Removed from your Treasure Box.', 'success');
      reloadFavs();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function shareLink() {
    if (!room) return;
    const url = `${window.location.origin}/sets/${room.performance.id}`;
    try {
      if (navigator.share) await navigator.share({ title: `${room.performance.performer.name} at ${room.venue.name}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Link copied.', 'success');
      }
    } catch {
      /* dismissed */
    }
  }

  async function liveCard() {
    if (requireLogin() || !room) return;
    try {
      if (isNativeApp()) await startLiveCard(room.performance.id, room.venue.name, room.performance.nowPlaying);
      else await enablePush(room.performance.id);
      toast('Done — what’s playing now shows on your lock screen, with 🔥 / 🙌 / Request buttons.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function leave() {
    if (!room || !confirm('Leave this session?')) return;
    try {
      await post(`/api/sessions/${room.performance.id}/leave`);
      router.push('/pass');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function joinWithCode() {
    try {
      const r = await post<{ id: string }>('/api/sessions/join', { code });
      if (r.id !== id) router.replace(`/sets/${r.id}`);
      else reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  const visible = useMemo(() => (room ? room.queue.filter((q) => manage || q.status !== 'PENDING' || q.user.id === user?.id) : []), [room, manage, user?.id]);

  if (error && !room) {
    const privateSession = error instanceof ApiError && error.code === 'PRIVATE_SESSION';
    return (
      <Screen nav title="Session">
        <div className="px-6 pt-28 text-center">
          {privateSession ? (
            <>
              <LogoA size={70} className="mx-auto" />
              <p className="mt-5 font-din text-[12px] font-bold uppercase tracking-[0.2em] text-lime">PASS THE AUX</p>
              <h1 className="semi-x mt-1 font-wide text-[26px] font-black uppercase text-white">Private session</h1>
              <p className="mt-2 font-ui text-[13px] text-white/65">Ask the host for the code to join.</p>
              <input className="field mt-5 text-center text-[20px] font-bold uppercase tracking-[0.3em]" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE" aria-label="Session code" />
              <button type="button" disabled={code.length < 4} onClick={joinWithCode} className="glass-pill mt-4 h-[56px] w-full text-[14px] disabled:opacity-50">
                Join session
              </button>
            </>
          ) : error.status === 401 ? (
            <Link href={`/login?next=${encodeURIComponent(router.asPath)}`} className="glass-pill mx-auto h-[56px] w-[240px] text-[14px]">
              Log in to join
            </Link>
          ) : (
            <ErrorNote message={error.message} onRetry={reload} />
          )}
        </div>
      </Screen>
    );
  }
  if (!room) return <Loader />;

  const p = room.performance;
  const np = p.nowPlaying?.track;
  const marquee =
    p.status === 'LIVE'
      ? np
        ? `CURRENTLY PLAYING • ${np.title.toUpperCase()} • ${np.artist.toUpperCase()}`
        : home
          ? `${p.title.toUpperCase()} • ADD THE FIRST SONG`
          : `LIVE NOW • ${p.performer.name.toUpperCase()}`
      : p.status === 'UPCOMING'
        ? `UP NEXT • ${p.performer.name.toUpperCase()} • STARTS ${clock(p.startsAt)}`
        : home
          ? `SESSION ENDED • THANKS FOR PASSING THE AUX`
          : `SET ENDED • ${p.performer.name.toUpperCase()} • THANK YOU`;
  const lastPosts = room.posts.slice(-2);
  const slotLabel = p.status === 'ENDED' ? (home ? 'Session has ended' : 'Set has ended') : home ? 'Add A Song' : room.openSlots > 0 ? 'Open Request Slot' : 'Make A Request!';
  const openRequest = () => {
    if (requireLogin()) return;
    setSheet('Song');
  };
  const chatLabel = home ? 'Session Chat' : performerView ? 'Section Chat' : room.venue.chatLabel;

  const chatPreview = (
    <>
      <button type="button" onClick={() => setPanel('chat')} className="mt-3 w-full text-left">
        <p className="font-din text-[8.5px] font-bold uppercase tracking-[0.1em] text-white">{chatLabel}</p>
        <div className="mt-1.5 space-y-1">
          {lastPosts.length ? lastPosts.map((m) => <ChatLine key={m.id} m={m} />) : <p className="font-din text-[8px] uppercase tracking-wider text-white/60">Be the first to say something.</p>}
        </div>
      </button>
      <CommentBar
        className="mt-2.5"
        tone={tone}
        onSend={sendChat}
        onRequest={openRequest}
        onCamera={() => (requireLogin() ? null : router.push(`/snippet?performanceId=${p.id}`))}
        onMore={() => setPanel('more')}
      />
    </>
  );

  return (
    <Screen nav title={home ? p.title : `${p.performer.name} · ${room.venue.name}`} theme={theme}>
      {home ? (
        <SessionHeader room={room} onInvite={() => setPanel('invite')} onMembers={() => setPanel('members')} chat={chatPreview} />
      ) : (
        <section className="relative mx-[18px] mt-[max(110px,calc(env(safe-area-inset-top)+86px))]">
          {!performerView && (
            <div className="absolute -top-[66px] left-[6px] z-10 max-w-[70%] [text-shadow:0_6px_18px_rgba(0,0,0,0.65)]">
              <VenueLogo name={room.venue.name} style={room.venue.logoStyle} />
              <Link href={`/search?venue=${room.venue.id}`} className="mt-1 block font-din text-[8.5px] font-bold uppercase tracking-[0.14em] text-white underline underline-offset-2">
                Current Location
              </Link>
            </div>
          )}
          <div className="relative min-h-[262px] overflow-hidden rounded-[28px] bg-black/40 shadow-[0_28px_50px_-20px_rgba(0,0,0,0.95)]">
            {(performerView ? p.performer.imageUrl ?? p.imageUrl : room.venue.imageUrl ?? p.imageUrl) && (
              <img src={(performerView ? p.performer.imageUrl ?? p.imageUrl : room.venue.imageUrl ?? p.imageUrl)!} alt="" className="absolute inset-0 h-full w-full object-cover" />
            )}
            {/* Depth: keep the photo bright up top, settle into shadow where the chat and comment bar sit. */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/75" />
            <div className="absolute inset-0 shadow-[inset_0_0_40px_rgba(0,0,0,0.55),inset_0_-70px_60px_-30px_rgba(0,0,0,0.6)]" />
            <button type="button" aria-label="Back" onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))} className="absolute right-4 top-4 z-10 p-1 text-white drop-shadow">
              <IconBack size={34} />
            </button>
            {performerView && (
              <Link href={`/venues/${room.venue.id}`} className="absolute right-3 top-3 z-10 flex items-center gap-2">
                <span className="text-right font-ui text-[19px] font-semibold leading-[1.05] text-white/90 drop-shadow">{room.venue.name}</span>
                {room.venue.imageUrl && <img src={room.venue.imageUrl} alt="" className="h-[62px] w-[62px] rounded-full object-cover shadow-[0_0_14px_rgba(0,0,0,0.6)]" />}
              </Link>
            )}
            <div className="relative flex min-h-[262px] flex-col justify-end px-4 pb-3 pt-16">
              {performerView ? (
                <>
                  <p className="font-ui text-[15px] font-semibold tracking-wide text-white">{p.performer.name}</p>
                  {p.caption && <p className="mt-1 line-clamp-3 font-ui text-[9.5px] font-medium leading-[1.5] text-white/90">{p.caption}</p>}
                </>
              ) : (
                <div className="mb-4">
                  <p className="font-ui text-[13px] font-medium tracking-wide text-white/90 [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">{room.venue.managementLabel}</p>
                  {room.venue.description && <p className="mt-1 line-clamp-2 font-ui text-[8.5px] text-white/85">( {room.venue.description} )</p>}
                </div>
              )}
              {chatPreview}
            </div>
            {!performerView && (
              <div className="absolute right-3 top-[52%] z-10 flex flex-col items-end gap-2">
                {sosTip && (
                  <div className="relative max-w-[150px] animate-fadeIn rounded-xl bg-[#8f1d1d]/95 px-2.5 py-1.5 text-center font-ui text-[8px] font-semibold leading-snug text-white shadow-lg">
                    Feeling Unsafe? Don&apos;t let it ruin your fun, call for help!
                    <span className="absolute -bottom-1 right-5 h-2 w-2 rotate-45 bg-[#8f1d1d]" />
                  </div>
                )}
                <a href={`tel:${room.venue.safetyPhone ?? '112'}`} aria-label="Call for help (SOS)" onClick={() => setSosTip(false)} className="drop-shadow-[0_0_10px_rgba(229,72,77,0.7)]">
                  <IconSos size={34} />
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Now playing */}
      <button type="button" onClick={() => np && setTrackMenu({ track: np })} className="mt-4 block w-full" aria-label={np ? `Now playing: ${np.title}. Save or share` : 'Now playing'}>
        <Marquee text={marquee} speed={42} className="px-2 font-din text-[13px] font-bold uppercase tracking-[0.16em] text-white glow-text-soft [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]" />
      </button>
      {user && p.status === 'LIVE' && np && <NowPlayingReactions performanceId={p.id} onSent={reload} />}
      {!home && <AuxInCard venueId={room.venue.id} />}

      {manage && p.status !== 'ENDED' && (
        <div className="mx-[18px] mt-3 flex gap-2">
          {p.status === 'UPCOMING' ? (
            <button type="button" onClick={() => control('golive')} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-lime py-2.5 font-din text-[13px] font-bold uppercase tracking-wider text-lime-ink">
              <IconPlay size={14} /> Go Live
            </button>
          ) : (
            <button type="button" onClick={() => control('skip')} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/15 py-2.5 font-din text-[13px] font-bold uppercase tracking-wider text-white">
              <IconSkip size={14} /> Next Track
            </button>
          )}
          <button type="button" onClick={() => setPanel('autoqueue')} className="flex items-center justify-center rounded-full bg-white/15 px-4 py-2.5 font-din text-[12px] font-bold uppercase tracking-wider text-white">
            {room.playback ? `Auto · ${room.playback.provider === 'APPLE_MUSIC' ? 'Apple' : room.playback.provider === 'YOUTUBE' ? 'YouTube' : 'Spotify'}` : 'Auto-queue'}
          </button>
          <button type="button" onClick={() => control('end')} className="flex items-center justify-center gap-2 rounded-full bg-red-500/80 px-5 py-2.5 font-din text-[13px] font-bold uppercase tracking-wider text-white">
            <IconStop size={13} /> End
          </button>
        </div>
      )}

      {/* Queue */}
      <section id="queue" className="mt-4 flex scroll-mt-24 flex-col gap-[14px] px-[18px]">
        {visible.slice(0, 1).map((r) => (
          <RequestCard key={r.id} r={r} tone={tone} manage={manage} fallbackImage={p.imageUrl} onVote={vote} onReact={react} onDecide={decide} onMenu={r.track ? () => setTrackMenu({ track: r.track!, request: r }) : undefined} />
        ))}
        {(!manage || home) && p.status !== 'ENDED' && <RequestSlot label={slotLabel} onClick={openRequest} disabled={!room.canRequest.ok && !!user} tone={theme === 'green' ? 'green' : 'blue'} />}
        {visible.slice(1).map((r) => (
          <RequestCard key={r.id} r={r} tone={tone} manage={manage} fallbackImage={p.imageUrl} onVote={vote} onReact={react} onDecide={decide} onMenu={r.track ? () => setTrackMenu({ track: r.track!, request: r }) : undefined} />
        ))}
        {visible.length === 0 && (
          <p className="py-6 text-center font-ui text-[13px] text-white/55">
            {p.status === 'ENDED' ? 'Nothing was played here.' : home ? 'The queue is empty — add the first song.' : 'No requests yet — be the first to shape the set.'}
          </p>
        )}
        {user && !room.canRequest.ok && room.canRequest.reason && p.status !== 'ENDED' && <p className="text-center font-ui text-[12px] text-white/55">{room.canRequest.reason}</p>}
      </section>

      <div className="mx-[18px] mt-6 flex items-center justify-between font-din text-[13px] font-bold text-white/85">
        <span>{home ? `${room.session!.memberCount} in the session · ${compact(p.requestCount)} songs` : `${compact(p.requestCount)} requests · ${compact(p.crowdEstimate)} in the crowd`}</span>
        <span className="flex items-center gap-3">
          {!home && (
            <button type="button" onClick={shareLink} aria-label="Share set" className="text-white/80">
              <IconShare size={20} />
            </button>
          )}
          <button type="button" onClick={like} aria-label={p.liked ? 'Unlike' : 'Like'} className={p.liked ? 'text-red-400' : 'text-white/85'}>
            <span className="flex items-center gap-1">
              {compact(p.likes)} <IconHeart size={20} />
            </span>
          </button>
        </span>
      </div>

      {sheet && <RequestSheet room={room} open onClose={() => setSheet(null)} onDone={reload} initialMode={sheet} />}

      {/* Chat pops up just like the Wire Room */}
      <Sheet open={panel === 'chat'} onClose={() => setPanel(null)} className="!px-2">
        <div className="flex flex-col items-center">
          <LogoA size={44} />
          <p className="mt-2 font-din text-[12px] font-bold uppercase tracking-[0.16em] text-white/80">{chatLabel}</p>
        </div>
        <div className="flex max-h-[58dvh] flex-col overflow-y-auto pb-3">
          {(() => {
            const feat = [...room.posts].reverse().find((m) => (m.kind === 'MIC' || m.kind === 'SNIPPET') && m.imageUrl);
            return feat ? <FeaturedPost p={feat} onLike={() => likePost(feat)} /> : null;
          })()}
          <ul className="mt-4 flex flex-col gap-[10px] px-1">
            {[...room.posts].reverse().map((m) => (
              <WireRow key={m.id} p={m} meId={user?.id} />
            ))}
          </ul>
          {room.posts.length === 0 && <p className="py-6 text-center font-ui text-sm text-white/60">No messages yet.</p>}
        </div>
        <div className="px-2">
          <CommentBar tone={tone} onSend={sendChat} onRequest={() => (setPanel(null), openRequest())} onCamera={() => router.push(`/snippet?performanceId=${p.id}`)} />
        </div>
      </Sheet>

      <Sheet open={panel === 'more'} onClose={() => setPanel(null)} title="More">
        <div className="flex flex-col gap-2 pb-2">
          {np && <MoreItem onClick={() => (setPanel(null), setTrackMenu({ track: np }))}>♪ {np.title} — save or share</MoreItem>}
          {p.status === 'LIVE' && <MoreItem onClick={() => (setPanel(null), liveCard())}>Show what’s playing on my lock screen</MoreItem>}
          {manage && <MoreItem onClick={() => setPanel('autoqueue')}>Auto-queue requests (Spotify / Apple Music / YouTube)</MoreItem>}
          {!home && room.controls.mic !== 'NO' && !manage && (
            <MoreItem onClick={() => (setPanel(null), !requireLogin() && setSheet('On The Mic'))}>Go On The Mic</MoreItem>
          )}
          {home ? (
            <>
              <MoreItem onClick={() => setPanel('invite')}>Invite friends</MoreItem>
              {room.session!.isHost && <MoreItem onClick={() => setPanel('shareSession')}>Share to the Wire Room</MoreItem>}
              {room.session!.isHost && <MoreItem onClick={() => setPanel('settings')}>Session settings</MoreItem>}
              {!room.session!.isHost && <MoreItem onClick={leave}>Leave session</MoreItem>}
            </>
          ) : (
            <>
              {manage && <MoreItem onClick={() => (setPanel(null), setStory({ tab: 'Live set' }))}>Share this set to your story</MoreItem>}
              {manage && visible[0] && (
                <MoreItem onClick={() => (setPanel(null), setStory({ tab: 'Request', requestId: [...visible].sort((a, b) => b.up - a.up)[0].id }))}>Share the top request to your story</MoreItem>
              )}
              <MoreItem onClick={() => (setPanel(null), setFriendShare({ performanceId: p.id, title: 'this set' }))}>Send this set to a friend</MoreItem>
              <MoreItem onClick={() => (setPanel(null), shareLink())}>Share link</MoreItem>
              <MoreItem onClick={() => (setPanel(null), router.push(`/venues/${room.venue.id}?info=1`))}>About {room.venue.name}</MoreItem>
              <MoreItem onClick={() => (setPanel(null), router.push(`/search?venue=${room.venue.id}`))}>Show on the map</MoreItem>
              {room.venue.safetyPhone && <MoreItem onClick={() => (window.location.href = `tel:${room.venue.safetyPhone}`)}>Call venue security</MoreItem>}
            </>
          )}
        </div>
      </Sheet>

      <Sheet open={!!trackMenu} onClose={() => setTrackMenu(null)} title={trackMenu?.track.title}>
        {trackMenu && (
          <div className="flex flex-col gap-2 pb-2">
            <p className="-mt-2 mb-2 text-center font-ui text-[13px] text-white/60">{trackMenu.track.artist}</p>
            <MoreItem onClick={() => (toggleFavorite(trackMenu.track), setTrackMenu(null))}>{isFav(trackMenu.track) ? '♥ Saved — remove from Treasure Box' : '♡ Save to my Treasure Box'}</MoreItem>
            <MoreItem onClick={() => (setFriendShare({ track: trackMenu.track, title: trackMenu.track.title }), setTrackMenu(null))}>Send to a friend</MoreItem>
            {manage && !home && trackMenu.request && <MoreItem onClick={() => (setStory({ tab: 'Request', requestId: trackMenu.request!.id }), setTrackMenu(null))}>Share to your story</MoreItem>}
          </div>
        )}
      </Sheet>

      {manage && <AutoQueueSheet room={room} open={panel === 'autoqueue'} onClose={() => setPanel(null)} onChanged={reload} />}
      {friendShare && <ShareToFriendSheet open onClose={() => setFriendShare(null)} track={friendShare.track} performanceId={friendShare.performanceId} title={friendShare.title} />}
      {story && <AddStorySheet open onClose={() => setStory(null)} onPosted={() => toast('Shared to your story.', 'success')} initial={{ tab: story.tab, performanceId: p.id, requestId: story.requestId }} />}
      {home && room.session && (
        <>
          <InviteSheet open={panel === 'invite'} onClose={() => setPanel(null)} session={room.session} performanceId={p.id} title={p.title} />
          <MembersSheet open={panel === 'members'} onClose={() => setPanel(null)} room={room} onChanged={reload} />
          {room.session.isHost && <SessionSettingsSheet open={panel === 'settings'} onClose={() => setPanel(null)} room={room} onSaved={reload} />}
          {room.session.isHost && <ShareSessionSheet open={panel === 'shareSession'} onClose={() => setPanel(null)} room={room} onShared={() => router.push('/wire')} />}
        </>
      )}
    </Screen>
  );
}

function ChatLine({ m }: { m: PostDTO }) {
  const name = m.kind === 'MANAGEMENT' ? m.label ?? 'Management' : m.author.userName;
  return (
    <p className="truncate font-din text-[8.5px] font-semibold uppercase tracking-[0.06em] text-white/95">
      <span className="normal-case">{name}:</span> {m.text}
    </p>
  );
}

function MoreItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full rounded-2xl bg-white/[0.07] px-5 py-4 text-left font-ui text-[15px] font-semibold text-white transition hover:bg-white/10">
      {children}
    </button>
  );
}
