import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import type { AuxedPage } from '../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { post, errorMessage } from '@/lib/client/api';
import { clock, shortDate } from '@/lib/format';
import { cx } from '@/lib/util';
import type { PerformanceStatus } from '@/lib/types';

interface SetItem {
  id: string;
  title: string;
  venue: string;
  startsAt: string;
  status: PerformanceStatus;
}

/** Broadcast a request: tell the Wire Room (and the set's chat) that requests are open. */
const Broadcast: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const { data } = useApi<{ sets: SetItem[] }>('/api/artist/sets');
  const open = (data?.sets ?? []).filter((s) => s.status !== 'ENDED');
  const [setId, setSetId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const set = open.find((s) => s.id === setId) ?? null;

  useEffect(() => {
    if (!setId && open.length) setSetId((open.find((s) => s.status === 'LIVE') ?? open[0]).id);
  }, [open, setId]);
  useEffect(() => {
    if (set) setText(set.status === 'LIVE' ? `I'm live at ${set.venue} right now — send me your requests! 🔥` : `Catch me at ${set.venue} on ${shortDate(set.startsAt)} from ${clock(set.startsAt)}. Requests are open — tell me what to play!`);
  }, [set]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await post('/api/posts', { text: text.trim() });
      if (set) await post('/api/posts', { performanceId: set.id, text: text.trim() });
      toast('Broadcast sent to the Wire Room.', 'success');
      router.push('/wire');
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  }

  return (
    <Screen nav theme="green" title="Broadcast a request">
      <TitleBar title="Broadcast A Request" back />
      <section className="glow-card mx-[10px] px-6 pb-8 pt-7">
        <label className="label">Set</label>
        <div className="flex flex-col gap-2">
          {open.map((s) => (
            <button key={s.id} type="button" onClick={() => setSetId(s.id)} className={cx('rounded-2xl px-4 py-3 text-left', s.id === setId ? 'bg-lime/20 ring-1 ring-lime' : 'bg-black/35')}>
              <span className="block font-din text-[14px] font-bold uppercase tracking-wide text-white">{s.title}</span>
              <span className="block font-ui text-[12px] text-white/60">
                {s.venue} · {s.status === 'LIVE' ? 'Live now' : `${shortDate(s.startsAt)} ${clock(s.startsAt)}`}
              </span>
            </button>
          ))}
          {data && open.length === 0 && <p className="font-ui text-[13px] text-white/60">You have no live or upcoming sets. Your broadcast will still go to the Wire Room.</p>}
        </div>
        <label className="label mt-5">Message</label>
        <textarea className="field-area min-h-[120px]" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="button" disabled={busy || !text.trim()} onClick={send} className="glass-pill mt-6 h-[60px] w-full text-[15px] disabled:opacity-50">
          {busy ? 'Sending…' : 'Broadcast'}
        </button>
      </section>
    </Screen>
  );
};

Broadcast.auth = ['PERFORMER'];
export default Broadcast;
