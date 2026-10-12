import { useState } from 'react';
import { post, errorMessage } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import { rand } from '@/lib/format';
import { cx } from '@/lib/util';
import { Sheet } from './ui';
import { useToast } from './Toast';

const AMOUNTS = [50, 100, 200, 500];

/** Add tokens to the wallet through the payment provider's hosted checkout. */
export function TopUpSheet({ open, onClose, needCents }: { open: boolean; onClose: () => void; needCents?: number }) {
  const { user, refresh } = useSession();
  const toast = useToast();
  const suggested = needCents ? Math.max(50, Math.ceil(needCents / 100 / 10) * 10) : 100;
  const [amount, setAmount] = useState<number>(suggested);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = custom ? Number(custom) : amount;
  const valid = Number.isFinite(value) && value >= 20 && value <= 5000;

  async function pay() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ credited: boolean; redirectUrl: string }>('/api/wallet/topup', { amount: value });
      if (r.credited) {
        await refresh();
        toast(`${rand(value)} added to your token wallet.`, 'success');
        setBusy(false);
        onClose();
      } else {
        window.location.href = r.redirectUrl;
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Top up token wallet">
      <p className="mb-4 text-center font-ui text-[13px] text-white/65">
        Balance <span className="font-semibold text-white">{rand((user?.walletCents ?? 0) / 100)}</span>
        {needCents ? (
          <>
            {' '}· this request needs <span className="font-semibold text-white">{rand(needCents / 100)}</span>
          </>
        ) : null}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => {
              setAmount(a);
              setCustom('');
            }}
            className={cx(
              'rounded-2xl py-3 font-din text-[15px] font-bold transition',
              !custom && amount === a ? 'bg-lime text-lime-ink shadow-[0_0_18px_rgba(201,241,59,0.35)]' : 'bg-white/10 text-white',
            )}
          >
            R{a}
          </button>
        ))}
      </div>
      <label className="label mt-5" htmlFor="topup-custom">
        Or enter an amount (R20 – R5 000)
      </label>
      <input
        id="topup-custom"
        className="field"
        inputMode="decimal"
        placeholder="R"
        value={custom}
        onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ''))}
      />
      {error && (
        <p role="alert" className="mt-3 text-center font-ui text-[13px] text-red-200">
          {error}
        </p>
      )}
      <button type="button" disabled={!valid || busy} onClick={pay} className="glass-pill mt-6 h-[60px] w-full text-[15px] disabled:opacity-50">
        {busy ? 'Opening checkout…' : `Top up ${valid ? rand(value) : ''}`}
      </button>
      <p className="mt-3 text-center font-ui text-[11px] text-white/45">Card payments are processed securely by our payment partner. Tokens are in-app credit for requests (R1 = 1 token).</p>
    </Sheet>
  );
}
