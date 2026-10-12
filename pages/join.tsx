import Link from 'next/link';
import { useRouter } from 'next/router';
import { AppleButton, AuthLayout, GoogleButton, LoginHereLink } from '@/components/AuthLayout';
import { ROLE_PARAM, roleTheme } from '@/lib/client/session';

/** JOIN THE FAMILY AND GET AUXED. — themed per role. */
export default function Join() {
  const { query } = useRouter();
  const role = ROLE_PARAM[String(query.role ?? 'USER')] ?? 'USER';
  const theme = roleTheme(role) as 'blue' | 'green' | 'purple';
  const error = typeof query.error === 'string' ? query.error : null;

  return (
    <AuthLayout theme={theme} title="Join the family" footer={<LoginHereLink role={role} />}>
      {error && <p className="rounded-2xl border border-red-400/30 bg-red-950/70 px-4 py-3 text-center font-ui text-[13px] text-red-100">{error}</p>}
      <Link href={`/signup?role=${role}`} className="glass-pill h-[68px] w-full text-[16px] transition active:scale-[0.98]">
        Sign Up
      </Link>
      <GoogleButton href={`/api/auth/oauth/google?role=${role}`} />
      <AppleButton href={`/api/auth/oauth/apple?role=${role}`} />
    </AuthLayout>
  );
}
