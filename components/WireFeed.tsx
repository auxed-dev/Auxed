/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useState } from 'react';
import { useApi } from '@/lib/client/useApi';
import { post, errorMessage } from '@/lib/client/api';
import { compact, timeAgo } from '@/lib/format';
import { cx } from '@/lib/util';
import type { FriendDTO, PostAttachment, PostDTO } from '@/lib/types';
import { LogoA } from './Brand';
import { Avatar, Sheet } from './ui';
import { IconHeart, IconNote, IconShare, IconUsers } from './Icons';
import { useToast } from './Toast';

/** "RodnyVinyl On The Mic" → bold name + "On The Mic", as in the designs. */
export function MicMeta({ label }: { label: string }) {
  const m = /^(.*?)\s*(On The Mic)$/i.exec(label);
  return (
    <span className="shrink-0 font-din text-[9.5px] tracking-wide text-white/85">
      {m ? (
        <>
          <b className="font-bold text-white">{m[1]}</b> {m[2]}
        </>
      ) : (
        <b className="font-bold text-white">{label}</b>
      )}
    </span>
  );
}

export function NowPlayingMeta({ text }: { text: string }) {
  return (
    <span className="max-w-[58%] truncate text-right font-din text-[9.5px] tracking-wide text-white/85">
      <b className="font-bold text-white">{text}</b> is playing...
    </span>
  );
}

/** A chat row as in the Wire Room design (management and Wire Room rows are highlighted pills). */
export function WireRow({ p, onReply, meId }: { p: PostDTO; onReply?: () => void; meId?: string }) {
  const highlight = p.kind === 'MANAGEMENT' ? 'purple' : p.kind === 'SYSTEM' ? 'blue' : null;
  const toMe = p.to && p.to.id === meId;
  const meta = p.label ?? (p.to ? `${toMe ? 'To You' : `To ${p.to.userName}`} On The Mic` : null);
  return (
    <li
      className={cx('flex items-center gap-3 px-2 py-1.5', highlight && 'rounded-full py-2 pl-2 pr-5')}
      style={
        highlight === 'blue'
          ? { background: 'linear-gradient(90deg,#4248ad,#4c52b8)', boxShadow: '0 0 16px rgba(70,80,190,0.5)' }
          : highlight === 'purple'
            ? { background: 'linear-gradient(90deg,#6c35ad,#7b3fb8)', boxShadow: '0 0 16px rgba(120,60,190,0.5)' }
            : undefined
      }
    >
      {highlight === 'blue' ? (
        <span className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-[#111] shadow-[0_0_0_2px_#000]">
          <LogoA size={30} />
        </span>
      ) : (
        <Avatar src={p.author.avatarUrl} name={p.author.userName} size={50} ring={p.author.ring} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-ui text-[13px] font-semibold tracking-wide text-white">{p.author.userName}</span>
          {meta ? <MicMeta label={meta} /> : p.nowPlaying ? <NowPlayingMeta text={p.nowPlaying} /> : <span className="shrink-0 font-din text-[9.5px] text-white/50">{timeAgo(p.createdAt)}</span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={cx('min-w-0 truncate font-ui text-[13px] tracking-wide text-white/90', highlight && 'font-bold text-white')}>{highlight || p.kind === 'MIC' ? `“${p.text}”` : p.text}</p>
          {p.to && p.author.id !== meId && onReply && (
            <button type="button" onClick={onReply} className="shrink-0 font-din text-[11px] font-bold text-white">
              Private Reply
            </button>
          )}
        </div>
        {p.imageUrl && <img src={p.imageUrl} alt="" className="mt-2 max-h-[220px] w-full rounded-[18px] object-cover" loading="lazy" />}
        {p.attachment && <AttachmentCard a={p.attachment} className="mt-2" />}
      </div>
    </li>
  );
}

/** "Special On The Mic" feature at the top of the Wire Room. */
export function FeaturedPost({ p, onLike }: { p: PostDTO; onLike: () => void }) {
  return (
    <section className="mt-6 px-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar src={p.author.avatarUrl} name={p.author.userName} size={50} ring={p.author.ring} />
          <span className="font-ui text-[13px] font-semibold tracking-wide text-white">{p.author.userName}</span>
        </div>
        {p.nowPlaying && <NowPlayingMeta text={p.nowPlaying} />}
      </div>
      <div className="mt-1 flex gap-3">
        <div className="w-[44%] pt-8">
          <p className="font-ui text-[13px] font-bold tracking-wide text-white">{p.label ?? (p.kind === 'MIC' ? 'On The Mic' : 'Live Snippet')}</p>
          <p className="mt-2 font-ui text-[11px] text-white/85">“{p.text}”</p>
          {p.caption && <p className="mt-5 font-ui text-[9px] leading-[1.6] text-white/80">{p.caption}</p>}
        </div>
        <div className="relative flex-1">
          <img src={p.imageUrl!} alt="" className="h-[192px] w-full rounded-[24px] object-cover" />
          <button type="button" onClick={onLike} aria-label={p.liked ? 'Unlike' : 'Like'} className={cx('absolute -left-3 -top-3 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] transition active:scale-125', p.liked ? 'text-red-500' : 'text-[#ff2d3d]')}>
            <IconHeart size={40} />
          </button>
        </div>
      </div>
    </section>
  );
}

/** Shared set / request highlight / PASS THE AUX session card. */
export function AttachmentCard({ a, className }: { a: PostAttachment; className?: string }) {
  const label = a.type === 'session' ? 'PASS THE AUX' : a.type === 'request' ? 'Request highlight' : a.status === 'LIVE' ? 'Live set' : 'Set';
  const body = (
    <div className={cx('relative flex h-[92px] items-center gap-3 overflow-hidden rounded-[18px] bg-black/40 pr-3', className)}>
      {a.imageUrl && <img src={a.imageUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-[1px]" loading="lazy" />}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/30" />
      <div className="relative ml-3 flex h-[64px] w-[64px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-black/50">
        {a.track?.artwork ? <img src={a.track.artwork.replace('600x600', '200x200')} alt="" className="h-full w-full object-cover" /> : a.imageUrl ? <img src={a.imageUrl} alt="" className="h-full w-full object-cover" /> : <IconNote size={24} className="text-white/70" />}
      </div>
      <div className="relative min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-din text-[9px] font-bold uppercase tracking-[0.14em] text-lime">
          {a.status === 'LIVE' && <span className="h-1.5 w-1.5 animate-pulseGlow rounded-full bg-red-500" />}
          {label}
          {a.type === 'session' && a.memberCount ? <span className="text-white/60">· {a.memberCount} in</span> : null}
        </p>
        <p className="truncate font-din text-[15px] font-bold uppercase tracking-wide text-white">{a.title}</p>
        <p className="truncate font-ui text-[11.5px] text-white/70">{a.subtitle}</p>
        {a.type === 'request' && a.up !== undefined && <p className="font-din text-[10px] font-bold text-white/80">▲ {compact(a.up, true)} upvotes</p>}
      </div>
      <span
        className={cx(
          'relative shrink-0 rounded-full px-3 py-1.5 font-din text-[10px] font-bold uppercase tracking-wider',
          a.canJoin && a.status !== 'ENDED' ? 'bg-lime text-lime-ink' : 'bg-white/15 text-white/70',
        )}
      >
        {a.status === 'ENDED' ? 'Ended' : !a.canJoin ? 'Invite only' : a.type === 'session' ? 'Join' : 'Open'}
      </span>
    </div>
  );
  return a.canJoin && a.status !== 'ENDED' ? (
    <Link href={`/sets/${a.performanceId}`} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Social feed card (the Wire Room when you're not at a venue). */
export function FeedCard({ p, meId, onLike, onReply }: { p: PostDTO; meId?: string; onLike: () => void; onReply?: () => void }) {
  if (p.kind === 'MANAGEMENT' || p.kind === 'SYSTEM') return <WireRow p={p} meId={meId} onReply={onReply} />;
  const toMe = p.to && p.to.id === meId;
  return (
    <li className="rounded-[24px] bg-white/[0.045] px-4 pb-3 pt-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-center gap-3">
        <Avatar src={p.author.avatarUrl} name={p.author.userName} size={42} ring={p.author.ring} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-ui text-[13.5px] font-semibold tracking-wide text-white">{p.author.userName}</p>
          <p className="truncate font-din text-[9.5px] tracking-wide text-white/65">
            {p.to ? (
              <>
                <b className="text-white">{toMe ? 'To You' : `To ${p.to.userName}`}</b> On The Mic
              </>
            ) : p.nowPlaying ? (
              <>
                <b className="text-white">{p.nowPlaying}</b> is playing…
              </>
            ) : p.kind === 'SNIPPET' ? (
              'Pic snippet'
            ) : p.attachment ? (
              'Shared'
            ) : (
              'Wire Room'
            )}
          </p>
        </div>
        <span className="shrink-0 font-din text-[9.5px] text-white/45">{timeAgo(p.createdAt)}</span>
      </div>
      {p.text && <p className="mt-2.5 font-ui text-[14px] leading-snug text-white/90">{p.kind === 'MIC' ? `“${p.text}”` : p.text}</p>}
      {p.caption && <p className="mt-1 font-ui text-[11px] text-white/60">{p.caption}</p>}
      {p.imageUrl && <img src={p.imageUrl} alt="" className="mt-3 max-h-[380px] w-full rounded-[20px] object-cover" loading="lazy" />}
      {p.attachment && <AttachmentCard a={p.attachment} className="mt-3" />}
      <div className="mt-2.5 flex items-center gap-5 font-din text-[12px] font-bold text-white/80">
        <button type="button" onClick={onLike} aria-label={p.liked ? 'Unlike' : 'Like'} className={cx('flex items-center gap-1.5 transition active:scale-110', p.liked && 'text-[#ff2d3d]')}>
          <IconHeart size={18} /> {p.likes ? compact(p.likes) : ''}
        </button>
        {onReply && p.author.id !== meId && (
          <button type="button" onClick={onReply} className="flex items-center gap-1.5">
            <IconUsers size={16} /> Private reply
          </button>
        )}
      </div>
    </li>
  );
}

/** Pick a friend and send them something On The Mic (lands in their Treasure Box). */
export function MicToFriend({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const { data } = useApi<{ friends: FriendDTO[] }>(open ? '/api/friends' : null);
  const [to, setTo] = useState<string | null>(null);
  const [text, setText] = useState('');
  const friends = (data?.friends ?? []).filter((f) => f.status === 'ACCEPTED');

  async function send() {
    if (!to || !text.trim()) return;
    try {
      await post('/api/posts', { kind: 'MIC', text: text.trim(), toUserId: to });
      toast('Sent On The Mic.', 'success');
      setText('');
      setTo(null);
      onSent();
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="On The Mic to a friend">
      <FriendPicker friends={friends} value={to} onChange={setTo} loading={!data} />
      <textarea className="field-area min-h-[90px]" maxLength={500} placeholder="Say something nice…" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" disabled={!to || !text.trim()} onClick={send} className="glass-pill mt-4 h-[56px] w-full text-[14px] disabled:opacity-50">
        Send
      </button>
    </Sheet>
  );
}

export function FriendPicker({ friends, value, onChange, loading }: { friends: FriendDTO[]; value: string | null; onChange: (id: string) => void; loading?: boolean }) {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto pb-3">
      {friends.map((f) => (
        <button key={f.id} type="button" onClick={() => onChange(f.id)} className={cx('flex w-[64px] shrink-0 flex-col items-center gap-1 rounded-2xl p-1', value === f.id && 'bg-lime/20')}>
          <Avatar src={f.avatarUrl} name={f.userName} size={46} ring={value === f.id ? '#C9F13B' : f.ring} />
          <span className="w-full truncate text-center font-ui text-[10px] text-white/80">{f.userName}</span>
        </button>
      ))}
      {!loading && friends.length === 0 && (
        <p className="py-2 font-ui text-[13px] text-white/60">
          Add friends first from{' '}
          <Link href="/friends" className="underline">
            Add A Friend
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/** Share a set or song with a friend (lands in their Treasure Box). */
export function ShareToFriendSheet({
  open,
  onClose,
  track,
  performanceId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  track?: PostAttachment['track'];
  performanceId?: string | null;
  title: string;
}) {
  const toast = useToast();
  const { data } = useApi<{ friends: FriendDTO[] }>(open ? '/api/friends' : null);
  const [to, setTo] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const friends = (data?.friends ?? []).filter((f) => f.status === 'ACCEPTED');
  async function send() {
    if (!to) return;
    try {
      await post('/api/me/favorites/share', { friendId: to, track: track ?? null, performanceId: performanceId ?? null, note });
      toast('Sent to their Treasure Box.', 'success');
      setTo(null);
      setNote('');
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={`Share ${title}`}>
      <FriendPicker friends={friends} value={to} onChange={setTo} loading={!data} />
      <input className="field" placeholder="Add a note (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      <button type="button" disabled={!to} onClick={send} className="glass-pill mt-4 flex h-[56px] w-full items-center justify-center gap-2 text-[14px] disabled:opacity-50">
        <IconShare size={16} /> Send to friend
      </button>
    </Sheet>
  );
}
