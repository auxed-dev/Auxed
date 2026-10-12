import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { Screen } from '@/components/Screen';
import { LogoA } from '@/components/Brand';
import { Loader } from '@/components/Loader';
import { post, errorMessage } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';

/** Invite link: /pass/join/CODE — joins and opens the session (after logging in if needed). */
export default function JoinSession() {
  const router = useRouter();
  const { user, ready } = useSession();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);
  const code = typeof router.query.code === 'string' ? router.query.code : '';

  useEffect(() => {
    if (!router.isReady || !ready || ran.current) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
      return;
    }
    ran.current = true;
    post<{ id: string }>('/api/sessions/join', { code })
      .then((r) => router.replace(`/sets/${r.id}`))
      .catch((err) => setError(errorMessage(err)));
  }, [router, ready, user, code]);

  if (!error) return <Loader label="Joining the session…" />;
  return (
    <Screen title="Join session">
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-8 text-center">
        <LogoA size={72} />
        <p className="font-ui text-[15px] text-white/80">{error}</p>
        <Link href="/pass" className="glass-pill h-[54px] w-[220px] text-[14px]">
          Pass The Aux
        </Link>
      </div>
    </Screen>
  );
}
