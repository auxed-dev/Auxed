/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Screen } from '@/components/Screen';
import { LogoA, Topo } from '@/components/Brand';
import { homeFor, roleTheme, useSession, ROLE_PARAM } from '@/lib/client/session';

const BUTTON: Record<string, { bg: string; inner: string; glow: string }> = {
  blue: { bg: '#051451', inner: 'rgba(60,90,220,0.9)', glow: 'rgba(80,110,240,0.55)' },
  green: { bg: '#0d241c', inner: 'rgba(120,190,160,0.85)', glow: 'rgba(120,200,170,0.4)' },
  purple: { bg: '#0b0310', inner: 'rgba(166,68,246,0.95)', glow: 'rgba(176,99,246,0.6)' },
};

/** WELCOME TO THE REVOLUTION OF THE AUX. */
export default function Welcome() {
  const router = useRouter();
  const { user } = useSession();
  const role = user?.role ?? ROLE_PARAM[String(router.query.role ?? 'USER')] ?? 'USER';
  const theme = roleTheme(role) as 'blue' | 'green' | 'purple';
  const b = BUTTON[theme];

  return (
    <Screen theme={theme} title="Welcome" className="!bg-black">
      {theme === 'blue' && <img src="/art/welcome-bands-blue.svg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />}
      {theme === 'purple' && <img src="/art/welcome-glow-purple.svg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />}
      {theme === 'green' && (
        <>
          <Topo theme="green" className="opacity-80" />
          <div className="absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_48%,rgba(0,0,0,0.95),rgba(0,0,0,0.2))]" />
        </>
      )}
      <div className="relative flex min-h-[100dvh] flex-col items-center px-6">
        <img src="/art/welcome-headline.svg" alt="Welcome to the revolution of the aux" className="mt-[29dvh] w-[80%] max-w-[330px] select-none" draggable={false} />
        <p className="mt-auto font-sys text-[15px] text-white">let&apos;s get started on this exciting journey.</p>
        <Link
          href={user ? homeFor(user.role) : '/login'}
          aria-label="Let's go"
          className="mb-[max(64px,calc(env(safe-area-inset-bottom)+44px))] mt-[50px] flex h-[81px] w-[112px] items-center justify-center rounded-full transition active:scale-95"
          style={{ background: b.bg, boxShadow: `inset 0 4px 6px ${b.inner}, 0 4px 60px ${b.glow}` }}
        >
          <LogoA size={46} />
        </Link>
      </div>
    </Screen>
  );
}
