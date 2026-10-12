/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import type { AuxedPage } from './_app';
import { Screen, TitleBar } from '@/components/Screen';
import { Avatar, ChipLink, Sheet, Toggle } from '@/components/ui';
import { RequestTicket } from '@/components/Cards';
import { TopUpSheet } from '@/components/TopUpSheet';
import { IconCamera, IconLogout } from '@/components/Icons';
import { useToast } from '@/components/Toast';
import { MusicConnections, NightOutLimit, NotificationsRow } from '@/components/ProfileSettings';
import { useApi } from '@/lib/client/useApi';
import { del, patch, post, errorMessage } from '@/lib/client/api';
import { prepareImage, uploadImage } from '@/lib/client/image';
import { useSession } from '@/lib/client/session';
import { rand, shortDate } from '@/lib/format';
import { cx } from '@/lib/util';
import type { LedgerDTO, SessionUser, TicketDTO } from '@/lib/types';

const RINGS = ['#FFFFFF', '#C9F13B', '#3B6CFF', '#FF1A1A', '#FF8A00', '#8A5CFF', '#E5006E', '#2E5E4D'];
const ROLE_LABEL: Record<string, string> = { USER: 'AUXee', PERFORMER: 'Artist', OWNER: 'Owner', ADMIN: 'Admin' };

const Profile: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const { user, setUser, refresh, logout } = useSession();
  const { data: ledger, reload: reloadLedger } = useApi<{ walletCents: number; provider: string | null; entries: LedgerDTO[] }>('/api/me/ledger');
  const { data: tickets } = useApi<{ tickets: TicketDTO[] }>('/api/me/tickets');
  const [topUp, setTopUp] = useState(false);
  const [edit, setEdit] = useState(false);
  const [pw, setPw] = useState(false);
  const [danger, setDanger] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const t = router.query.topup;
    if (t === '1') setTopUp(true);
    else if (t === 'success') toast('Top-up received — your tokens are ready.', 'success');
    else if (t === 'pending') toast("We're confirming your payment. Your balance updates as soon as it clears.");
    else if (t === 'cancelled') toast('Top-up cancelled.');
    else if (t === 'failed') toast('That payment did not go through.', 'error');
    if (t) {
      refresh();
      reloadLedger();
      router.replace('/profile', undefined, { shallow: true });
    }
  }, [router, toast, refresh, reloadLedger]);

  if (!user) return null;

  async function onAvatar(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const data = await prepareImage(file, { maxDim: 640 });
      const url = await uploadImage(data);
      const r = await patch<{ user: SessionUser }>('/api/me', { avatarUrl: url });
      setUser(r.user);
      toast('Profile photo updated.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setUploading(false);
    }
  }

  async function setRing(ring: string) {
    try {
      const r = await patch<{ user: SessionUser }>('/api/me', { ring });
      setUser(r.user);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function shareLocation(share: boolean) {
    try {
      if (share) {
        const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10_000 }));
        await patch('/api/me/location', { share: true, lat: pos.coords.latitude, lng: pos.coords.longitude });
      } else await patch('/api/me/location', { share: false });
      await refresh();
    } catch (err) {
      toast(err instanceof GeolocationPositionError ? 'Allow location access to share where you are.' : errorMessage(err), 'error');
    }
  }

  async function resendVerify() {
    try {
      await post('/api/auth/verify', { resend: true });
      toast('Verification email sent.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <Screen nav title="Profile">
      <TitleBar title="Profile" />

      <section className="flex items-center gap-4 px-7">
        <button type="button" onClick={() => fileRef.current?.click()} className="relative" aria-label="Change profile photo">
          <Avatar src={user.avatarUrl} name={user.userName} size={78} ring={user.ring} />
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black text-white shadow">
            <IconCamera size={14} />
          </span>
          {uploading && <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 font-ui text-[11px]">…</span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onAvatar(e.target.files?.[0])} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-ui text-[22px] font-semibold text-white">{user.userName}</p>
          <p className="truncate font-ui text-[13px] text-white/60">{user.email}</p>
          <p className="mt-1 inline-block rounded-full bg-white/10 px-2.5 py-0.5 font-din text-[10px] font-bold uppercase tracking-wider text-white/80">{ROLE_LABEL[user.role]}</p>
        </div>
      </section>

      {!user.emailVerified && (
        <div className="mx-5 mt-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-300/25 bg-amber-900/30 px-4 py-3 font-ui text-[13px] text-amber-50">
          Please verify your email.
          <button type="button" onClick={resendVerify} className="shrink-0 font-semibold underline">
            Resend link
          </button>
        </div>
      )}

      {/* Wallet */}
      <section className="glow-card mx-4 mt-5 px-6 py-6">
        <p className="font-din text-[15px] uppercase tracking-[0.08em] text-white/85">Token Wallet</p>
        <p className="font-din text-[40px] font-bold leading-tight text-white glow-text-soft">{rand(user.walletCents / 100)}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => setTopUp(true)} className="shrink-0 whitespace-nowrap rounded-full bg-lime px-5 py-2.5 font-din text-[13px] font-bold uppercase tracking-wider text-lime-ink">
            Top Up
          </button>
          {ledger?.provider === 'dev' && <span className="self-center font-ui text-[11px] text-white/50">Test mode: top-ups credit instantly (no real payment)</span>}
        </div>
        <div className="mt-5 space-y-2">
          {ledger?.entries.slice(0, 6).map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 font-ui text-[13px]">
              <span className="min-w-0 truncate text-white/80">
                <span className="text-white/45">{shortDate(e.createdAt)} · </span>
                {e.note}
              </span>
              <span className={cx('shrink-0 font-semibold', e.amountCents >= 0 ? 'text-lime' : 'text-white')}>
                {e.amountCents >= 0 ? '+' : ''}
                {rand(e.amountCents / 100)}
              </span>
            </div>
          ))}
          {ledger && ledger.entries.length === 0 && <p className="font-ui text-[13px] text-white/55">No transactions yet.</p>}
        </div>
      </section>

      {/* Tickets */}
      {user.role === 'USER' && (
        <section className="mt-6">
          <h2 className="px-7 font-din text-[15px] font-bold uppercase tracking-[0.08em] text-white/80">Request Tickets</h2>
          <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-5">
            {tickets?.tickets.map((t) => <RequestTicket key={t.performanceId} t={t} />)}
            {tickets && tickets.tickets.length === 0 && <p className="font-ui text-[13px] text-white/55">Make a request at a set and your ticket lands here.</p>}
          </div>
        </section>
      )}

      {/* Links */}
      <section className="mt-6 grid grid-cols-2 gap-2.5 px-5">
        <ChipLink onClick={() => router.push('/friends')}>Friends</ChipLink>
        <ChipLink onClick={() => router.push('/treasure')}>My Treasure Box</ChipLink>
        <ChipLink onClick={() => router.push('/search?layer=friends')}>My Hotspots</ChipLink>
        <ChipLink onClick={() => router.push('/vibes')}>Stream The Vibe</ChipLink>
        <ChipLink onClick={() => router.push('/pass')}>Pass The Aux</ChipLink>
        {user.role === 'PERFORMER' && <ChipLink onClick={() => router.push('/artist/profile')}>Artist Portfolio</ChipLink>}
        {user.role === 'PERFORMER' && <ChipLink onClick={() => router.push('/artist/controls')}>Creative Controls</ChipLink>}
        {(user.role === 'OWNER' || user.role === 'ADMIN') && <ChipLink onClick={() => router.push('/owner/venues')}>My Venues</ChipLink>}
        {(user.role === 'OWNER' || user.role === 'ADMIN') && <ChipLink onClick={() => router.push('/owner/events/new')}>Post An Event</ChipLink>}
        {(user.role === 'OWNER' || user.role === 'ADMIN') && <ChipLink onClick={() => router.push('/owner/aux-in')}>AUX IN Broadcaster</ChipLink>}
      </section>

      {/* Settings */}
      <section className="panel mx-4 mt-6 divide-y divide-white/10">
        {user.role === 'USER' && <NightOutLimit />}
        <MusicConnections />
        <NotificationsRow />
        <Row label="Share my location with friends">
          <Toggle checked={user.shareLocation} onChange={shareLocation} label="Share my location" />
        </Row>
        <Row label="Ring colour">
          <div className="flex gap-1.5">
            {RINGS.map((c) => (
              <button key={c} type="button" aria-label={`Ring ${c}`} onClick={() => setRing(c)} className={cx('h-6 w-6 rounded-full border-2', user.ring === c ? 'border-lime' : 'border-transparent')} style={{ background: c }} />
            ))}
          </div>
        </Row>
        <button type="button" onClick={() => setEdit(true)} className="w-full px-5 py-4 text-left font-ui text-[14px] font-semibold text-white">
          Change username
        </button>
        <button type="button" onClick={() => setPw(true)} className="w-full px-5 py-4 text-left font-ui text-[14px] font-semibold text-white">
          Change password
        </button>
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.replace('/roles');
          }}
          className="flex w-full items-center gap-2 px-5 py-4 text-left font-ui text-[14px] font-semibold text-white"
        >
          <IconLogout size={18} /> Log out
        </button>
        <button type="button" onClick={() => setDanger(true)} className="w-full px-5 py-4 text-left font-ui text-[14px] font-semibold text-red-300">
          Delete account
        </button>
      </section>
      <p className="mt-4 text-center font-ui text-[11px] text-white/35">
        AUXED · <Link href="/roles">Power to the music lovers</Link>
      </p>

      <TopUpSheet
        open={topUp}
        onClose={() => {
          setTopUp(false);
          reloadLedger();
        }}
      />
      <EditUsername open={edit} onClose={() => setEdit(false)} />
      <ChangePassword open={pw} onClose={() => setPw(false)} />
      <DeleteAccount open={danger} onClose={() => setDanger(false)} />
    </Screen>
  );
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <span className="font-ui text-[14px] font-semibold text-white">{label}</span>
      {children}
    </div>
  );
}

function EditUsername({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, setUser } = useSession();
  const toast = useToast();
  const [name, setName] = useState(user?.userName ?? '');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const r = await patch<{ user: SessionUser }>('/api/me', { userName: name.trim() });
      setUser(r.user);
      toast('Username updated.', 'success');
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Change username">
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} aria-label="Username" />
      <button type="button" disabled={busy} onClick={save} className="glass-pill mt-4 h-[56px] w-full text-[14px] disabled:opacity-50">
        Save
      </button>
    </Sheet>
  );
}

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await post('/api/me/password', { current, next });
      toast('Password changed.', 'success');
      setCurrent('');
      setNext('');
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Change password">
      <div className="flex flex-col gap-3">
        <input className="field" type="password" autoComplete="current-password" placeholder="Current password (leave blank if you signed up with Google/Apple)" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input className="field" type="password" autoComplete="new-password" placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <button type="button" disabled={busy || next.length < 8} onClick={save} className="glass-pill mt-4 h-[56px] w-full text-[14px] disabled:opacity-50">
        Save
      </button>
    </Sheet>
  );
}

function DeleteAccount({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { setUser } = useSession();
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      await del('/api/me', { password });
      setUser(null);
      router.replace('/roles');
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Delete account">
      <p className="font-ui text-[14px] leading-relaxed text-white/80">
        This permanently deletes your profile, requests, posts and any remaining token balance. It can&apos;t be undone.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <input className="field" type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <input className="field" placeholder='Type "DELETE" to confirm' value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
      </div>
      <button type="button" disabled={busy || confirmText !== 'DELETE'} onClick={remove} className="mt-4 h-[56px] w-full rounded-full bg-red-600 font-din text-[14px] font-bold uppercase tracking-wider text-white disabled:opacity-40">
        Delete my account
      </button>
    </Sheet>
  );
}

Profile.auth = true;
export default Profile;
