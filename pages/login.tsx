import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, type FormEvent } from 'react';
import { AppleButton, AuthLayout, GoogleButton, WideHeadline } from '@/components/AuthLayout';
import { post, errorMessage } from '@/lib/client/api';
import { ROLE_PARAM, roleTheme, useSession } from '@/lib/client/session';

function safeNext(next: unknown): string | null {
  const n = typeof next === 'string' ? next : '';
  return n.startsWith('/') && !n.startsWith('//') ? n : null;
}

export default function Login() {
  const router = useRouter();
  const { refresh } = useSession();
  const role = ROLE_PARAM[String(router.query.role ?? 'USER')] ?? 'USER';
  const theme = roleTheme(role) as 'blue' | 'green' | 'purple';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { redirect } = await post<{ redirect: string }>('/api/auth/login', { email, password });
      await refresh();
      router.replace(safeNext(router.query.next) ?? redirect);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      theme={theme}
      title="Log in"
      headline={<WideHeadline lines={['Welcome', 'back.', 'Get', 'AUXED.']} />}
      footer={
        <>
          New here?{' '}
          <Link href="/roles" className="underline underline-offset-2">
            Join the family
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <label className="sr-only" htmlFor="email">
          Email
        </label>
        <input id="email" className="field" placeholder="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="sr-only" htmlFor="password">
          Password
        </label>
        <input id="password" className="field" placeholder="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Link href="/forgot" className="-mt-1 self-end pr-3 font-ui text-[12px] text-white/70 underline underline-offset-2">
          Forgot password?
        </Link>
        {error && (
          <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-950/70 px-4 py-3 text-center font-ui text-[13px] text-red-100">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="glass-pill h-[68px] w-full text-[16px] transition active:scale-[0.98] disabled:opacity-60">
          {busy ? 'Logging in…' : 'Log In'}
        </button>
      </form>
      <GoogleButton href={`/api/auth/oauth/google?role=${role}`} />
      <AppleButton href={`/api/auth/oauth/apple?role=${role}`} />
    </AuthLayout>
  );
}
