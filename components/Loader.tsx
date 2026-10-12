import { LogoA } from './Brand';

export function Loader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-black">
      <LogoA size={64} className="animate-pulseGlow" />
      {label && <p className="font-ui text-sm text-white/60">{label}</p>}
    </div>
  );
}

/** Inline placeholder used inside cards while data loads or when there is nothing to chart yet. */
export function LogoPlaceholder({ size = 110, pulse }: { size?: number; pulse?: boolean }) {
  return (
    <div className="flex items-center justify-center py-2">
      <LogoA size={size} className={pulse ? 'animate-pulseGlow opacity-80' : 'opacity-80'} />
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[22px] bg-white/[0.06] ${className}`} />;
}
