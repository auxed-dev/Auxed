import { useRouter } from 'next/router';
import { useState } from 'react';
import type { AuxedPage } from '../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { SessionFields } from '@/components/Session';
import { useToast } from '@/components/Toast';
import { post, errorMessage } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import type { SessionVisibility } from '@/lib/types';

/** Start a PASS THE AUX session. */
const NewSession: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const [title, setTitle] = useState(user ? `${user.userName}'s Session` : '');
  const [visibility, setVisibility] = useState<SessionVisibility>('FRIENDS');
  const [approval, setApproval] = useState<'AUTO' | 'HOST'>('AUTO');
  const [limit, setLimit] = useState(3);
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const r = await post<{ id: string }>('/api/sessions', { title, visibility, approval, perGuestLimit: limit, source });
      toast('Session started — invite your friends!', 'success');
      router.replace(`/sets/${r.id}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  }

  return (
    <Screen nav title="Start a session">
      <TitleBar title="Start A Session" back="/pass" />
      <section className="glow-card mx-[10px] px-5 pb-8 pt-6">
        <SessionFields
          title={title}
          setTitle={setTitle}
          visibility={visibility}
          setVisibility={setVisibility}
          approval={approval}
          setApproval={setApproval}
          limit={limit}
          setLimit={setLimit}
          source={source}
          setSource={setSource}
        />
        <button type="button" disabled={busy || title.trim().length < 2} onClick={start} className="glass-pill mt-6 h-[60px] w-full text-[15px] disabled:opacity-50">
          {busy ? 'Starting…' : 'Pass The Aux'}
        </button>
        <p className="mt-3 text-center font-ui text-[11px] text-white/50">Play the queue on your own speaker. Sessions are free and close after 12 hours.</p>
      </section>
    </Screen>
  );
};

NewSession.auth = true;
export default NewSession;
