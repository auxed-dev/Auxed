import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthLayout, WideHeadline } from '@/components/AuthLayout';
import { post, errorMessage } from '@/lib/client/api';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/api/auth/forgot', { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      theme="blue"
      title="Reset password"
      headline={<WideHeadline lines={['Lost', 'the', 'aux?']} />}
      footer={
        <Link href="/login" className="underline underline-offset-2">
          Back to login
        </Link>
      }
    >
      {sent ? (
        <p className="panel px-5 py-6 text-center font-ui text-[14px] leading-relaxed text-white/85">
          If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires in an hour.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="px-2 text-center font-ui text-[13px] text-white/70">Enter your email and we&apos;ll send you a link to set a new password.</p>
          <input className="field" placeholder="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Email" />
          {error && <p role="alert" className="text-center font-ui text-[13px] text-red-200">{error}</p>}
          <button type="submit" disabled={busy} className="glass-pill h-[68px] w-full text-[16px] disabled:opacity-60">
            {busy ? 'Sending…' : 'Send Reset Link'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
