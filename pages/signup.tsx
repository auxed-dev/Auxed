import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, type FormEvent } from 'react';
import { AuthLayout, LoginHereLink, WideHeadline } from '@/components/AuthLayout';
import { post, errorMessage } from '@/lib/client/api';
import { ROLE_PARAM, roleTheme, useSession } from '@/lib/client/session';

const ROLE_LABEL = { USER: 'AUXee', PERFORMER: 'Artist', OWNER: 'Owner' } as const;

export default function Signup() {
  const router = useRouter();
  const { refresh } = useSession();
  const role = ROLE_PARAM[String(router.query.role ?? 'USER')] ?? 'USER';
  const theme = roleTheme(role) as 'blue' | 'green' | 'purple';
  const [form, setForm] = useState({ userName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { redirect } = await post<{ redirect: string }>('/api/auth/signup', { ...form, role });
      await refresh();
      router.replace(redirect);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      theme={theme}
      title="Sign up"
      headline={<WideHeadline lines={['Sign up', 'and get', 'AUXED.']} />}
      footer={<LoginHereLink role={role} />}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <p className="text-center font-din text-[12px] font-semibold uppercase tracking-[0.16em] text-white/70">
          Joining as <span className="text-white">{ROLE_LABEL[role]}</span> ·{' '}
          <Link href="/roles" className="underline">
            change
          </Link>
        </p>
        <label className="sr-only" htmlFor="userName">
          Username
        </label>
        <input id="userName" className="field" placeholder="Username" autoComplete="username" value={form.userName} onChange={set('userName')} required minLength={3} maxLength={24} />
        <label className="sr-only" htmlFor="email">
          Email
        </label>
        <input id="email" className="field" placeholder="Email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} required />
        <div className="relative">
          <label className="sr-only" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="field pr-16"
            placeholder="Password (8+ characters, a letter and a number)"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            required
            minLength={8}
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 font-din text-[11px] font-bold uppercase tracking-wider text-white/60">
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        {error && (
          <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-950/70 px-4 py-3 text-center font-ui text-[13px] text-red-100">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="glass-pill mt-2 h-[68px] w-full text-[16px] transition active:scale-[0.98] disabled:opacity-60">
          {busy ? 'Creating…' : 'Create Account'}
        </button>
        <p className="px-2 text-center font-ui text-[11px] leading-relaxed text-white/50">
          By creating an account you agree to AUXED&apos;s terms of use and privacy policy.
        </p>
      </form>
    </AuthLayout>
  );
}
