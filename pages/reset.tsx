import { useRouter } from 'next/router';
import { useState, type FormEvent } from 'react';
import { AuthLayout, WideHeadline } from '@/components/AuthLayout';
import { post, errorMessage } from '@/lib/client/api';
import { homeFor, useSession } from '@/lib/client/session';

export default function Reset() {
  const router = useRouter();
  const { refresh } = useSession();
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/api/auth/reset', { token, password });
      const user = await refresh();
      router.replace(homeFor(user?.role));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout theme="blue" title="New password" headline={<WideHeadline lines={['New', 'password,', 'same', 'vibe.']} />}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input
          className="field"
          placeholder="New password (8+ characters, a letter and a number)"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          aria-label="New password"
        />
        {!token && <p className="text-center font-ui text-[13px] text-red-200">This link is missing its token. Request a new one.</p>}
        {error && <p role="alert" className="text-center font-ui text-[13px] text-red-200">{error}</p>}
        <button type="submit" disabled={busy || !token} className="glass-pill h-[68px] w-full text-[16px] disabled:opacity-60">
          {busy ? 'Saving…' : 'Save Password'}
        </button>
      </form>
    </AuthLayout>
  );
}
