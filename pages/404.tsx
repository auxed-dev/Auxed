import Link from 'next/link';
import { Screen } from '@/components/Screen';
import { LogoA } from '@/components/Brand';
import { homeFor, useSession } from '@/lib/client/session';

export default function NotFound() {
  const { user } = useSession();
  return (
    <Screen title="Not found">
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-8 text-center">
        <LogoA size={90} glow />
        <h1 className="wide-x font-wide text-[30px] font-black uppercase leading-none text-white">Lost the aux</h1>
        <p className="font-ui text-[14px] text-white/65">That page doesn&apos;t exist (or the set has moved on).</p>
        <Link href={user ? homeFor(user.role) : '/'} className="glass-pill h-[56px] w-[220px] text-[14px]">
          Take me home
        </Link>
      </div>
    </Screen>
  );
}
