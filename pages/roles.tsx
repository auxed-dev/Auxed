import Link from 'next/link';
import { Screen } from '@/components/Screen';

const ROLES = [
  {
    role: 'USER',
    label: 'AUXee',
    text: '#d4daf6',
    bg: 'radial-gradient(78% 72% at 50% 52%, #26358a 0%, #34449a 42%, #8e98cf 82%, #c9cfea 100%)',
    glow: 'rgba(110,130,230,0.45)',
  },
  {
    role: 'PERFORMER',
    label: 'ARTIST',
    text: '#ffffff',
    bg: 'radial-gradient(78% 72% at 50% 52%, #2b5446 0%, #35604f 42%, #8fa89d 82%, #c6d3cd 100%)',
    glow: 'rgba(90,160,130,0.35)',
  },
  {
    role: 'OWNER',
    label: 'OWNER',
    text: '#ffffff',
    bg: 'radial-gradient(78% 72% at 50% 52%, #6a1cc4 0%, #7c34cc 42%, #b693df 82%, #dccbef 100%)',
    glow: 'rgba(160,80,230,0.45)',
  },
] as const;

/** Pick how you're joining: AUXee (music lover), Artist, or Owner. */
export default function Roles() {
  return (
    <Screen title="Choose your role" theme="blue" className="!bg-black">
      <div className="pointer-events-none absolute left-1/2 top-[32%] h-[260px] w-[300px] -translate-x-1/2 rounded-full bg-[#2c3e9e]/25 blur-[70px]" />
      <div className="pointer-events-none absolute left-1/2 top-[46%] h-[200px] w-[300px] -translate-x-1/2 rounded-full bg-[#2d6b55]/20 blur-[70px]" />
      <div className="pointer-events-none absolute left-1/2 top-[58%] h-[220px] w-[300px] -translate-x-1/2 rounded-full bg-[#6b21c8]/25 blur-[70px]" />
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-[38px]">
        {ROLES.map((r) => (
          <Link
            key={r.role}
            href={`/join?role=${r.role}`}
            className="flex h-[106px] w-[232px] items-center justify-center rounded-full transition active:scale-95"
            style={{ background: r.bg, boxShadow: `0 0 50px ${r.glow}, inset 0 0 18px rgba(255,255,255,0.25)` }}
          >
            <span className="semi-x font-wide text-[26px] font-extrabold tracking-[0.01em]" style={{ color: r.text }}>
              {r.label}
            </span>
          </Link>
        ))}
      </div>
    </Screen>
  );
}
