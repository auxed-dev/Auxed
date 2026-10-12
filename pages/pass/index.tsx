/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import type { AuxedPage } from '../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { Avatar, EmptyState } from '@/components/ui';
import { SESSION_NAME, VISIBILITY_COPY } from '@/components/Session';
import { Skeleton } from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { post, errorMessage } from '@/lib/client/api';
import type { SessionSummary } from '@/lib/types';

/** PASS THE AUX hub: start a private listening session, join one with a code, or jump back in. */
const AuxHub: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const { data } = useApi<{ sessions: SessionSummary[] }>('/api/sessions', { refreshMs: 20_000 });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const live = (data?.sessions ?? []).filter((s) => s.status === 'LIVE');
  const past = (data?.sessions ?? []).filter((s) => s.status !== 'LIVE');

  async function join() {
    setBusy(true);
    try {
      const r = await post<{ id: string }>('/api/sessions/join', { code });
      router.push(`/sets/${r.id}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  }

  return (
    <Screen nav title={SESSION_NAME}>
      <TitleBar title="Pass The Aux" back />
      <section className="glow-card mx-[14px] px-6 pb-7 pt-7">
        <p className="font-din text-[11px] font-bold uppercase tracking-[0.22em] text-lime">Private sessions</p>
        <h1 className="semi-x mt-1 font-wide text-[30px] font-black uppercase leading-[0.95] text-white">
          Your speaker.
          <br />
          Everyone&apos;s aux.
        </h1>
        <p className="mt-3 font-ui text-[13px] leading-relaxed text-white/75">
          Start a session at home, in the car or at the braai. Friends join with your code and build the queue together — vote songs up, react and chat. Free.
        </p>
        <Link href="/pass/new" className="glass-pill mt-5 h-[60px] w-full text-[15px]">
          Start a session
        </Link>
        <div className="mt-4 flex gap-2">
          <input
            className="field text-center text-[16px] font-bold uppercase tracking-[0.25em]"
            maxLength={8}
            placeholder="ENTER CODE"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            aria-label="Session code"
          />
          <button type="button" disabled={code.length < 4 || busy} onClick={join} className="shrink-0 rounded-full bg-lime px-6 font-din text-[13px] font-bold uppercase tracking-wider text-lime-ink disabled:opacity-50">
            Join
          </button>
        </div>
      </section>

      <h2 className="mt-7 px-7 font-din text-[14px] font-bold uppercase tracking-[0.1em] text-white/75">Live now</h2>
      <div className="mt-3 flex flex-col gap-3 px-4">
        {!data && [0, 1].map((i) => <Skeleton key={i} className="h-[92px]" />)}
        {live.map((s) => (
          <SessionRow key={s.id} s={s} />
        ))}
        {data && live.length === 0 && <EmptyState title="No live sessions" body="Start one, or ask a friend for their code. Friends' sessions also show up in the Wire Room." />}
      </div>
      {past.length > 0 && (
        <>
          <h2 className="mt-7 px-7 font-din text-[14px] font-bold uppercase tracking-[0.1em] text-white/75">Earlier</h2>
          <div className="mt-3 flex flex-col gap-3 px-4">
            {past.slice(0, 8).map((s) => (
              <SessionRow key={s.id} s={s} />
            ))}
          </div>
        </>
      )}
    </Screen>
  );
};

function SessionRow({ s }: { s: SessionSummary }) {
  return (
    <Link href={`/sets/${s.id}`} className="panel flex items-center gap-3 px-4 py-3.5">
      <Avatar src={s.host.avatarUrl} name={s.host.userName} size={46} ring={s.host.ring} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-din text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/60">
          {s.status === 'LIVE' && <span className="h-1.5 w-1.5 animate-pulseGlow rounded-full bg-red-500" />}
          {s.isHost ? 'You host' : `Hosted by ${s.host.userName}`} · {VISIBILITY_COPY[s.visibility].label}
        </span>
        <span className="block truncate font-din text-[16px] font-bold uppercase tracking-wide text-white">{s.title}</span>
        <span className="block truncate font-ui text-[12px] text-white/65">
          {s.nowPlaying ? `♪ ${s.nowPlaying.track.title} — ${s.nowPlaying.track.artist}` : `${s.queued} in the queue`} · {s.memberCount} in
        </span>
      </span>
    </Link>
  );
}

AuxHub.auth = true;
export default AuxHub;
