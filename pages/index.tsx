import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { LogoA, Wordmark } from '@/components/Brand';
import { homeFor, useSession } from '@/lib/client/session';

/** Splash: the A mark, then the AUXED wordmark, then into the app. */
export default function Splash() {
  const router = useRouter();
  const { user, ready } = useSession();
  const [stage, setStage] = useState<0 | 1>(0);
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    const a = setTimeout(() => setStage(1), 1300);
    const b = setTimeout(() => setElapsed(true), 2900);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  useEffect(() => {
    if (!elapsed || !ready) return;
    router.replace(user ? homeFor(user.role) : '/roles');
  }, [elapsed, ready, user, router]);

  return (
    <div className="app-frame flex items-center justify-center !bg-black" onClick={() => setElapsed(true)}>
      <Head>
        <title>AUXED</title>
      </Head>
      <div className={`absolute transition-all duration-700 ${stage === 0 ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}>
        <LogoA size={132} className="animate-popIn" />
      </div>
      <div className={`absolute transition-all duration-700 ${stage === 1 ? 'scale-100 opacity-100' : 'scale-110 opacity-0'}`}>
        <Wordmark />
      </div>
    </div>
  );
}
