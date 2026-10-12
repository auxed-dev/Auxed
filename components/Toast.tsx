import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Tone = 'info' | 'success' | 'error';
interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastItem {
  id: number;
  text: string;
  tone: Tone;
  action?: ToastAction;
  ms: number;
}

type Show = (text: string, tone?: Tone, opts?: { action?: ToastAction; ms?: number }) => void;
const ToastContext = createContext<Show>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const show = useCallback<Show>((text, tone = 'info', opts) => {
    const id = next.current++;
    const ms = opts?.ms ?? (tone === 'error' ? 5200 : opts?.action ? 8000 : 3200);
    setItems((xs) => [...xs.slice(-2), { id, text, tone, action: opts?.action, ms }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), ms);
  }, []);
  const dismiss = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] mx-auto flex max-w-[var(--app-w)] flex-col items-center gap-2 px-4 pt-[max(14px,env(safe-area-inset-top))]" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto relative flex w-full animate-popIn items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 font-ui text-[14px] leading-snug shadow-2xl backdrop-blur-xl ${
              t.tone === 'error'
                ? 'border-red-400/30 bg-red-950/85 text-red-50'
                : t.tone === 'success'
                  ? 'border-lime/30 bg-[#16200a]/90 text-lime'
                  : 'border-white/15 bg-black/80 text-white'
            }`}
          >
            <span className="flex-1">{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 font-din text-[12px] font-bold uppercase tracking-wider text-white"
              >
                {t.action.label}
              </button>
            )}
            {t.action && <span className="absolute bottom-0 left-0 h-[3px] bg-current opacity-50" style={{ animation: `toastbar ${t.ms}ms linear forwards` }} />}
          </div>
        ))}
      </div>
      <style>{`@keyframes toastbar { from { width: 100% } to { width: 0% } }`}</style>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
