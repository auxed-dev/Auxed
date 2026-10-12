import { useRouter } from 'next/router';
import { useState } from 'react';
import type { AuxedPage } from '../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { post, errorMessage } from '@/lib/client/api';
import { cx } from '@/lib/util';
import type { OwnerDashboard } from '@/lib/server/services/dashboards';

/** Hear From Management: a message into a live set's chat at your venue, or the whole Wire Room. */
const OwnerBroadcast: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const { data } = useApi<OwnerDashboard>('/api/owner/dashboard?period=weekly');
  const sets = (data?.upcoming ?? []).filter((p) => p.status === 'LIVE' || p.status === 'UPCOMING');
  const [target, setTarget] = useState<string>('wire');
  const [label, setLabel] = useState('Management Team');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      await post('/api/owner/broadcast', { performanceId: target === 'wire' ? undefined : target, text: text.trim(), label: label.trim() || undefined });
      toast('Message sent.', 'success');
      router.push(target === 'wire' ? '/wire' : `/sets/${target}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  }

  return (
    <Screen nav theme="purple" title="Hear from Management">
      <TitleBar title="Hear From Management" back="/owner" />
      <section className="glow-card mx-[10px] flex flex-col gap-4 px-5 pb-8 pt-6">
        <div>
          <label className="label">Send to</label>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => setTarget('wire')} className={cx('rounded-2xl px-4 py-3 text-left font-ui text-[14px] font-semibold', target === 'wire' ? 'bg-lime/20 text-white ring-1 ring-lime' : 'bg-black/35 text-white/85')}>
              The whole Wire Room
            </button>
            {sets.map((p) => (
              <button key={p.id} type="button" onClick={() => setTarget(p.id)} className={cx('rounded-2xl px-4 py-3 text-left', target === p.id ? 'bg-lime/20 ring-1 ring-lime' : 'bg-black/35')}>
                <span className="block font-ui text-[14px] font-semibold text-white">
                  {p.venue.name} · {p.performer.name}
                </span>
                <span className="block font-ui text-[12px] text-white/60">{p.status === 'LIVE' ? 'Live now — goes into the set chat' : 'Upcoming set chat'}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Sign as</label>
          <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea className="field-area min-h-[110px]" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="“Shout out my boy David!”" />
        </div>
        <button type="button" disabled={busy || !text.trim()} onClick={send} className="glass-pill mt-2 h-[60px] w-full text-[15px] disabled:opacity-50">
          {busy ? 'Sending…' : 'Send'}
        </button>
      </section>
    </Screen>
  );
};

OwnerBroadcast.auth = ['OWNER'];
export default OwnerBroadcast;
