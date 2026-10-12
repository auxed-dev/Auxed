import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { AuthLayout, WideHeadline } from '@/components/AuthLayout';
import { post, errorMessage } from '@/lib/client/api';
import { homeFor, useSession } from '@/lib/client/session';

export default function Verify() {
  const router = useRouter();
  const { user, refresh } = useSession();
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (!router.isReady || ran.current) return;
    ran.current = true;
    const token = typeof router.query.token === 'string' ? router.query.token : '';
    if (!token) {
      setState('error');
      setError('This link is missing its token.');
      return;
    }
    post('/api/auth/verify', { token })
      .then(() => {
        setState('done');
        refresh();
      })
      .catch((err) => {
        setState('error');
        setError(errorMessage(err));
      });
  }, [router.isReady, router.query.token, refresh]);

  return (
    <AuthLayout theme="blue" title="Verify email" headline={<WideHeadline lines={state === 'done' ? ['You’re', 'in.', 'Get', 'AUXED.'] : ['Checking', 'your', 'link…']} />}>
      <div className="panel px-5 py-6 text-center font-ui text-[14px] text-white/85">
        {state === 'working' && 'Verifying your email…'}
        {state === 'done' && 'Your email is verified.'}
        {state === 'error' && error}
      </div>
      <Link href={user ? homeFor(user.role) : '/login'} className="glass-pill h-[68px] w-full text-[16px]">
        Continue
      </Link>
    </AuthLayout>
  );
}
