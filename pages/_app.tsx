import type { AppProps } from 'next/app';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, type ReactNode } from 'react';
import localFont from 'next/font/local';
import '../styles/globals.css';
import 'leaflet/dist/leaflet.css';
import { SessionProvider, homeFor, useSession } from '@/lib/client/session';
import { ToastProvider } from '@/components/Toast';
import { AuxInProvider, AuxMiniPlayer } from '@/lib/client/auxin';
import { Loader } from '@/components/Loader';
import type { Role } from '@/lib/types';

// Self-hosted (OFL) so builds never depend on reaching Google Fonts.
const archivo = localFont({
  src: '../styles/fonts/archivo-100_900.woff2',
  weight: '100 900',
  variable: '--font-archivo',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '62% 125%' }],
});
const saira = localFont({
  src: '../styles/fonts/saira-100_900.woff2',
  weight: '100 900',
  variable: '--font-saira',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '50% 125%' }],
});
const anton = localFont({ src: '../styles/fonts/anton-400.woff2', weight: '400', variable: '--font-anton', display: 'swap' });
const poppins = localFont({
  src: [
    { path: '../styles/fonts/poppins-300.woff2', weight: '300' },
    { path: '../styles/fonts/poppins-400.woff2', weight: '400' },
    { path: '../styles/fonts/poppins-500.woff2', weight: '500' },
    { path: '../styles/fonts/poppins-600.woff2', weight: '600' },
    { path: '../styles/fonts/poppins-700.woff2', weight: '700' },
  ],
  variable: '--font-poppins',
  display: 'swap',
});
const barlow = localFont({
  src: [
    { path: '../styles/fonts/barlow-400.woff2', weight: '400' },
    { path: '../styles/fonts/barlow-500.woff2', weight: '500' },
    { path: '../styles/fonts/barlow-600.woff2', weight: '600' },
    { path: '../styles/fonts/barlow-700.woff2', weight: '700' },
    { path: '../styles/fonts/barlow-800.woff2', weight: '800' },
  ],
  variable: '--font-barlow',
  display: 'swap',
});
const bagel = localFont({ src: '../styles/fonts/bagel-400.woff2', weight: '400', variable: '--font-bagel', display: 'swap' });
const italiana = localFont({ src: '../styles/fonts/italiana-400.woff2', weight: '400', variable: '--font-italiana', display: 'swap' });
const playfair = localFont({ src: '../styles/fonts/playfair-700_900.woff2', weight: '700 900', variable: '--font-playfair', display: 'swap' });

const fontVars = [archivo, anton, saira, poppins, barlow, bagel, italiana, playfair].map((f) => f.variable).join(' ');

/** Pages opt into auth with `Page.auth = true` (any signed-in user) or a list of roles. */
export type AuxedPage<P = object> = NextPage<P> & { auth?: true | Role[] };

function Guard({ auth, children }: { auth?: true | Role[]; children: ReactNode }) {
  const { user, ready } = useSession();
  const router = useRouter();
  const allowed = !auth || (user && (auth === true || auth.includes(user.role) || user.role === 'ADMIN'));

  useEffect(() => {
    if (!auth || !ready) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
    } else if (!allowed) {
      router.replace(homeFor(user.role));
    }
  }, [auth, ready, user, allowed, router]);

  if (auth && (!ready || !allowed)) return <Loader />;
  return <>{children}</>;
}

export default function App({ Component, pageProps }: AppProps) {
  const auth = (Component as AuxedPage).auth;

  useEffect(() => {
    // Registered in development too (it never caches on localhost) so push notifications can be tested.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  return (
    <>
      <Head>
        <title>AUXED</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <div className={`${fontVars} font-ui`}>
        <SessionProvider>
          <ToastProvider>
            <AuxInProvider>
              <Guard auth={auth}>
                <Component {...pageProps} />
              </Guard>
              <AuxMiniPlayer />
            </AuxInProvider>
          </ToastProvider>
        </SessionProvider>
      </div>
    </>
  );
}
