/* eslint-disable @next/next/no-img-element */
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useSession, themeFor } from '@/lib/client/session';
import { cx } from '@/lib/util';
import type { Role, ThemeName } from '@/lib/types';
import { LogoA } from './Brand';
import { IconPlus } from './Icons';

interface ScreenProps {
  children: ReactNode;
  title?: string;
  /** Defaults to the signed-in user's role colour. */
  theme?: ThemeName;
  nav?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Screen({ children, title, theme, nav = false, className, style }: ScreenProps) {
  const { user } = useSession();
  const t = theme ?? themeFor(user?.role);
  return (
    <div data-theme={t} className={cx('app-frame', nav && 'pb-[118px]', className)} style={style}>
      <Head>
        <title>{title ? `${title} · AUXED` : 'AUXED'}</title>
      </Head>
      {children}
      {nav && <BottomNav theme={t} role={user?.role ?? 'USER'} />}
    </div>
  );
}

interface FabItem {
  label: string;
  href: string;
}

const FAB_ITEMS: Record<'USER' | 'PERFORMER' | 'OWNER', FabItem[]> = {
  USER: [
    { label: 'Quick\nRequest', href: '/request' },
    { label: 'Capture\nThe Moment', href: '/snippet' },
    { label: 'Add A\nFriend', href: '/friends' },
    { label: 'Pass\nThe Aux', href: '/pass' },
  ],
  PERFORMER: [
    { label: 'Add A New\nRequest Set', href: '/artist/sets/new' },
    { label: 'Broadcast\nA Request', href: '/artist/broadcast' },
    { label: 'Retrieve\nMessages\nOn The Mic', href: '/artist?tab=requests&kind=MIC' },
    { label: 'Connect To\nVenue', href: '/artist/sets/new?live=1' },
  ],
  OWNER: [
    { label: 'Register\nA Venue', href: '/owner/venues/new' },
    { label: 'Post An\nEvent', href: '/owner/events/new' },
    { label: 'Book An\nArtist', href: '/owner/bookings/new' },
    { label: 'Hear From\nManagement', href: '/owner/broadcast' },
  ],
};

function navFor(role: Role) {
  const dash = role === 'PERFORMER' ? '/artist' : role === 'OWNER' || role === 'ADMIN' ? '/owner' : '/home';
  return [
    { href: dash, label: dash === '/home' ? 'Home' : 'Dashboard', icon: '/art/ic-home.svg', w: 36 },
    { href: '/search', label: 'Search', icon: '/art/ic-search.svg', w: 22 },
    { href: '/wire', label: 'Wire Room', icon: '/art/ic-wire.svg', w: 32 },
    { href: '/profile', label: 'Profile', icon: '/art/ic-profile.svg', w: 29 },
  ];
}

const FAB_STYLE: Record<ThemeName, CSSProperties> = {
  blue: { background: 'radial-gradient(circle at 50% 40%, #24399e 0%, #142470 70%)', boxShadow: '0 0 24px rgba(102,131,255,0.55), inset 0 0 0 2px rgba(150,170,255,0.25)' },
  green: { background: 'radial-gradient(circle at 50% 35%, #3e7a64 0%, #1f4a3b 75%)', boxShadow: '0 0 26px rgba(165,209,194,0.35), inset 0 0 0 2px rgba(220,255,240,0.25)' },
  purple: { background: 'radial-gradient(circle at 50% 35%, #8a3fe0 0%, #4b1696 75%)', boxShadow: '0 0 26px rgba(200,86,224,0.45), inset 0 0 0 2px rgba(240,200,255,0.25)' },
  olive: { background: 'radial-gradient(circle at 50% 35%, #9c9a3a 0%, #5c5a1c 75%)', boxShadow: '0 0 26px rgba(214,210,120,0.4)' },
};

const BAR_STYLE: Record<ThemeName, CSSProperties> = {
  blue: { background: 'linear-gradient(180deg, #2235a8 0%, #1a2b8c 100%)', boxShadow: '0 -8px 30px rgba(10,20,90,0.6)' },
  green: { background: 'linear-gradient(180deg, rgba(8,10,9,0.92) 0%, #000 100%)' },
  purple: { background: 'linear-gradient(180deg, rgba(10,6,14,0.94) 0%, #000 100%)' },
  olive: { background: '#000' },
};

function BottomNav({ theme, role }: { theme: ThemeName; role: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = navFor(role);
  const fab = FAB_ITEMS[role === 'ADMIN' ? 'OWNER' : (role as 'USER' | 'PERFORMER' | 'OWNER')] ?? FAB_ITEMS.USER;

  useEffect(() => setOpen(false), [router.asPath]);

  const active = (href: string) => router.pathname === href || (href !== '/home' && router.pathname.startsWith(href + '/'));

  return (
    <>
      {open && <button aria-label="Close menu" className="fixed inset-0 z-40 animate-fadeIn bg-black/55 backdrop-blur-[2px]" onClick={() => setOpen(false)} />}
      <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[var(--app-w)]" aria-label="Main">
        <div className="relative h-[92px] rounded-t-[38px] pb-[env(safe-area-inset-bottom)]" style={BAR_STYLE[theme]}>
          <div className="grid h-[78px] grid-cols-[1fr_1fr_96px_1fr_1fr] items-end px-4 pb-2">
            {items.slice(0, 2).map((it) => (
              <NavItem key={it.href} {...it} active={active(it.href)} />
            ))}
            <div />
            {items.slice(2).map((it) => (
              <NavItem key={it.href} {...it} active={active(it.href)} />
            ))}
          </div>
          <button
            type="button"
            aria-label={open ? 'Close quick actions' : 'Quick actions'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="absolute left-1/2 top-[-34px] flex h-[82px] w-[82px] -translate-x-1/2 items-center justify-center rounded-full transition-transform active:scale-95"
            style={FAB_STYLE[theme]}
          >
            <IconPlus size={34} strokeWidth={3.4} className={cx('text-white/75 transition-transform duration-300', open && 'rotate-45')} />
          </button>
        </div>
        {/* Radial quick actions: an arc above the + button, layered over the bar. */}
        <div className="pointer-events-none absolute bottom-[85px] left-1/2 z-20 h-0 w-0">
          {fab.map((item, i) => {
            const angle = (158 - i * (136 / Math.max(1, fab.length - 1))) * (Math.PI / 180);
            const r = 122;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  'absolute flex w-[96px] -translate-x-1/2 flex-col items-center gap-1 transition-all duration-300 ease-out',
                  open ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-50 opacity-0',
                )}
                style={{ left: open ? x : 0, bottom: open ? y - 19 : -19, transitionDelay: open ? `${i * 35}ms` : '0ms' }}
              >
                <span className="whitespace-pre-line text-center font-din text-[8.5px] font-bold uppercase leading-[1.15] tracking-wide text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                  {item.label}
                </span>
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full shadow-[0_6px_16px_rgba(0,0,0,0.6)]" style={FAB_STYLE[theme]}>
                  <LogoA size={24} />
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function NavItem({ href, label, icon, w, active }: { href: string; label: string; icon: string; w: number; active: boolean }) {
  return (
    <Link href={href} className="group flex flex-col items-center gap-1" aria-current={active ? 'page' : undefined}>
      <span className={cx('flex h-[34px] items-end transition', active ? 'drop-shadow-[0_0_10px_rgba(255,255,255,0.75)]' : 'opacity-90')}>
        <img src={icon} alt="" width={w} height={32} style={{ width: w, height: 'auto' }} draggable={false} />
      </span>
      <span className={cx('font-din text-[8.5px] font-extrabold uppercase tracking-wide text-white', active && 'glow-text')}>{label}</span>
    </Link>
  );
}

/** Page title row ("Dashboard", "My Set Box" ...) with an optional back arrow on the right. */
export function TitleBar({ title, back, right, className }: { title: string; back?: string | true; right?: ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <header className={cx('flex items-center justify-between px-7 pb-5 pt-[max(56px,calc(env(safe-area-inset-top)+28px))]', className)}>
      <h1 className="font-ui text-[26px] font-semibold tracking-wide text-white/85 glow-text-soft">{title}</h1>
      <div className="flex items-center gap-3">
        {right}
        {back && (
          <button
            type="button"
            aria-label="Back"
            onClick={() => (typeof back === 'string' ? router.push(back) : window.history.length > 1 ? router.back() : router.push('/'))}
            className="-mr-1 p-1 text-white"
          >
            <svg width="34" height="22" viewBox="0 0 34 22" fill="none" aria-hidden>
              <path d="M32 11H4M12 2 3 11l9 9" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
