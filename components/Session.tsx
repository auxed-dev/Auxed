/* eslint-disable @next/next/no-img-element */
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { del, patch, post, errorMessage } from '@/lib/client/api';
import { cx } from '@/lib/util';
import type { HomeSessionDTO, RoomDTO, SessionVisibility } from '@/lib/types';
import { Avatar, Sheet, Toggle } from './ui';
import { IconBack, IconShare, IconUsers } from './Icons';
import { useToast } from './Toast';

export const SESSION_NAME = 'PASS THE AUX';

export const VISIBILITY_COPY: Record<SessionVisibility, { label: string; hint: string }> = {
  PRIVATE: { label: 'Invite only', hint: 'People need your code or link.' },
  FRIENDS: { label: 'Friends', hint: 'Your AUXED friends can join straight from the Wire Room.' },
  PUBLIC: { label: 'Anyone with the link', hint: 'Anyone who opens the link or your Wire Room post can join.' },
};

/** Header of a PASS THE AUX room: session name, host, members and the invite button. */
export function SessionHeader({ room, onInvite, onMembers, chat }: { room: RoomDTO; onInvite: () => void; onMembers: () => void; chat: React.ReactNode }) {
  const router = useRouter();
  const s = room.session!;
  const p = room.performance;
  return (
    <section className="relative mx-[18px] mt-[max(64px,calc(env(safe-area-inset-top)+40px))]">
      <div className="relative overflow-hidden rounded-[28px] shadow-[0_24px_50px_-18px_rgba(0,0,0,0.9)]" style={{ background: 'radial-gradient(120% 90% at 0% 0%, rgb(var(--accent) / 0.85), transparent 60%), radial-gradient(120% 90% at 100% 100%, rgb(var(--accent-soft) / 0.35), transparent 60%), #07070c' }}>
        {p.imageUrl && <img src={p.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
        <div className="absolute inset-0 shadow-[inset_0_0_60px_rgba(0,0,0,0.75)]" />
        <button type="button" aria-label="Back" onClick={() => (window.history.length > 1 ? router.back() : router.push('/pass'))} className="absolute right-4 top-4 z-10 p-1 text-white drop-shadow">
          <IconBack size={30} />
        </button>
        <div className="relative px-4 pb-3 pt-5">
          <p className="font-din text-[10px] font-bold uppercase tracking-[0.24em] text-lime">{SESSION_NAME}</p>
          <h1 className="semi-x mt-1 max-w-[82%] font-wide text-[34px] font-black uppercase leading-[0.95] text-white">{p.title}</h1>
          <p className="mt-2 font-ui text-[12px] text-white/80">
            Hosted by <b className="text-white">{s.host.userName}</b>
            {s.settings.source ? ` · playing from ${s.settings.source}` : ''}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <button type="button" onClick={onMembers} className="flex items-center" aria-label="See who's here">
              <span className="flex -space-x-2.5">
                {s.members.slice(0, 5).map((m) => (
                  <Avatar key={m.id} src={m.avatarUrl} name={m.userName} size={30} ring="#000" />
                ))}
              </span>
              <span className="ml-2.5 font-din text-[11px] font-bold uppercase tracking-wider text-white/85">{s.memberCount} in the session</span>
            </button>
            <button type="button" onClick={onInvite} className="flex items-center gap-1.5 rounded-full bg-lime px-3.5 py-1.5 font-din text-[11px] font-bold uppercase tracking-wider text-lime-ink">
              <IconUsers size={14} /> Invite
            </button>
          </div>
          {chat}
        </div>
      </div>
    </section>
  );
}

export function InviteSheet({ open, onClose, session, performanceId, title }: { open: boolean; onClose: () => void; session: HomeSessionDTO; performanceId: string; title: string }) {
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const link = typeof window !== 'undefined' && session.joinCode ? `${window.location.origin}/pass/join/${session.joinCode}` : '';

  useEffect(() => {
    if (!open || !link) return;
    import('qrcode')
      .then((QR) => QR.toDataURL(link, { margin: 1, width: 360, color: { dark: '#000000', light: '#ffffff' } }))
      .then(setQr)
      .catch(() => setQr(null));
  }, [open, link]);

  async function shareLink() {
    try {
      if (navigator.share) await navigator.share({ title: `Join "${title}" on AUXED`, text: `Pass the aux with me — code ${session.joinCode}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast('Invite link copied.', 'success');
      }
    } catch {
      /* dismissed */
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Invite to the session">
      <div className="flex flex-col items-center gap-4 pb-2">
        {qr ? <img src={qr} alt={`QR code to join ${title}`} className="h-[200px] w-[200px] rounded-[18px] bg-white p-2" /> : <div className="h-[200px] w-[200px] animate-pulse rounded-[18px] bg-white/10" />}
        <div className="text-center">
          <p className="font-din text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Session code</p>
          <p className="font-wide text-[34px] font-black tracking-[0.18em] text-white">{session.joinCode}</p>
        </div>
        <p className="max-w-[280px] text-center font-ui text-[12px] text-white/60">Friends scan this, open the link, or enter the code under PASS THE AUX. {VISIBILITY_COPY[session.visibility].hint}</p>
        <button type="button" onClick={shareLink} className="glass-pill flex h-[54px] w-full items-center justify-center gap-2 text-[14px]">
          <IconShare size={16} /> Share invite link
        </button>
        <input readOnly value={link} className="field text-center text-[12px]" aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
      </div>
      <span className="hidden">{performanceId}</span>
    </Sheet>
  );
}

export function MembersSheet({ open, onClose, room, onChanged }: { open: boolean; onClose: () => void; room: RoomDTO; onChanged: () => void }) {
  const toast = useToast();
  const s = room.session!;
  async function remove(userId: string, name: string) {
    if (!confirm(`Remove ${name} from the session?`)) return;
    try {
      await del(`/api/sessions/${room.performance.id}/members/${userId}`);
      onChanged();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={`${s.memberCount} in the session`}>
      <ul className="flex max-h-[50dvh] flex-col gap-2 overflow-y-auto pb-2">
        {s.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-3 py-2">
            <Avatar src={m.avatarUrl} name={m.userName} size={38} ring={m.ring} />
            <span className="flex-1 font-ui text-[14px] font-semibold text-white">
              {m.userName}
              {m.id === s.host.id && <span className="ml-2 rounded-full bg-lime px-2 py-0.5 font-din text-[9px] font-bold uppercase text-lime-ink">Host</span>}
            </span>
            {s.isHost && m.id !== s.host.id && (
              <button type="button" onClick={() => remove(m.id, m.userName)} className="font-ui text-[12px] text-white/55">
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function SessionSettingsSheet({ open, onClose, room, onSaved }: { open: boolean; onClose: () => void; room: RoomDTO; onSaved: () => void }) {
  const toast = useToast();
  const s = room.session!;
  const [title, setTitle] = useState(room.performance.title);
  const [visibility, setVisibility] = useState<SessionVisibility>(s.visibility);
  const [approval, setApproval] = useState(s.settings.approval);
  const [limit, setLimit] = useState(s.settings.perGuestLimit);
  const [source, setSource] = useState(s.settings.source ?? '');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await patch(`/api/sessions/${room.performance.id}`, { title, visibility, approval, perGuestLimit: limit, source });
      toast('Session updated.', 'success');
      onSaved();
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Session settings">
      <SessionFields
        title={title}
        setTitle={setTitle}
        visibility={visibility}
        setVisibility={setVisibility}
        approval={approval}
        setApproval={setApproval}
        limit={limit}
        setLimit={setLimit}
        source={source}
        setSource={setSource}
      />
      <button type="button" disabled={busy} onClick={save} className="glass-pill mt-5 h-[56px] w-full text-[14px] disabled:opacity-50">
        Save
      </button>
    </Sheet>
  );
}

const SOURCES = ['Spotify', 'Apple Music', 'YouTube Music', 'Speaker', 'Car'];

export function SessionFields(p: {
  title: string;
  setTitle: (v: string) => void;
  visibility: SessionVisibility;
  setVisibility: (v: SessionVisibility) => void;
  approval: 'AUTO' | 'HOST';
  setApproval: (v: 'AUTO' | 'HOST') => void;
  limit: number;
  setLimit: (v: number) => void;
  source: string;
  setSource: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="label">Session name</label>
        <input className="field" value={p.title} onChange={(e) => p.setTitle(e.target.value)} maxLength={60} placeholder="e.g. Kamo’s Crib Session" />
      </div>
      <div>
        <label className="label">Who can join</label>
        <div className="flex flex-col gap-2">
          {(['FRIENDS', 'PRIVATE', 'PUBLIC'] as SessionVisibility[]).map((v) => (
            <button key={v} type="button" onClick={() => p.setVisibility(v)} className={cx('rounded-2xl px-4 py-3 text-left', p.visibility === v ? 'bg-lime/20 ring-1 ring-lime' : 'bg-black/30')}>
              <span className="block font-ui text-[14px] font-semibold text-white">{VISIBILITY_COPY[v].label}</span>
              <span className="block font-ui text-[12px] text-white/60">{VISIBILITY_COPY[v].hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/30 px-4 py-3">
        <span>
          <span className="block font-ui text-[14px] font-semibold text-white">Approve each song</span>
          <span className="block font-ui text-[12px] text-white/60">Off = guests’ songs go straight into the queue.</span>
        </span>
        <Toggle checked={p.approval === 'HOST'} onChange={(on) => p.setApproval(on ? 'HOST' : 'AUTO')} label="Approve each song" />
      </div>
      <div>
        <label className="label">Songs each guest can have waiting · {p.limit}</label>
        <input type="range" min={1} max={10} value={p.limit} onChange={(e) => p.setLimit(Number(e.target.value))} className="aux-range" aria-label="Songs per guest" />
      </div>
      <div>
        <label className="label">Playing from (optional)</label>
        <div className="flex flex-wrap gap-2">
          {SOURCES.map((s) => (
            <button key={s} type="button" onClick={() => p.setSource(p.source === s ? '' : s)} className={cx('rounded-full px-3 py-1.5 font-ui text-[12px]', p.source === s ? 'bg-lime text-lime-ink' : 'bg-white/10 text-white/85')}>
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ShareSessionSheet({ open, onClose, room, onShared }: { open: boolean; onClose: () => void; room: RoomDTO; onShared: () => void }) {
  const toast = useToast();
  const s = room.session!;
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState<SessionVisibility>(s.visibility === 'PRIVATE' ? 'FRIENDS' : s.visibility);
  async function share() {
    try {
      await post(`/api/sessions/${room.performance.id}/share`, { text, visibility });
      toast('Shared to the Wire Room.', 'success');
      onShared();
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Share to the Wire Room">
      <textarea className="field-area min-h-[80px]" maxLength={300} placeholder={`Come through — I'm passing the aux in "${room.performance.title}" 🎶`} value={text} onChange={(e) => setText(e.target.value)} />
      <label className="label mt-4">Who can join from the post</label>
      <div className="grid grid-cols-3 gap-2">
        {(['FRIENDS', 'PUBLIC', 'PRIVATE'] as SessionVisibility[]).map((v) => (
          <button key={v} type="button" onClick={() => setVisibility(v)} className={cx('rounded-2xl px-2 py-2.5 font-ui text-[12px] font-semibold', visibility === v ? 'bg-lime text-lime-ink' : 'bg-black/30 text-white/85')}>
            {VISIBILITY_COPY[v].label}
          </button>
        ))}
      </div>
      <button type="button" onClick={share} className="glass-pill mt-5 h-[56px] w-full text-[14px]">
        Share
      </button>
    </Sheet>
  );
}
