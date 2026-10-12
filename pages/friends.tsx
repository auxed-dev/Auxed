import { useEffect, useState } from 'react';
import type { AuxedPage } from './_app';
import { Screen, TitleBar } from '@/components/Screen';
import { Avatar, EmptyState } from '@/components/ui';
import { IconCheck, IconPlus, IconSearch, IconX } from '@/components/Icons';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { api, del, post, errorMessage } from '@/lib/client/api';
import type { FriendDTO, UserBrief } from '@/lib/types';

/** Add a friend by username, accept requests, see who's sharing their location. */
const Friends: AuxedPage = () => {
  const toast = useToast();
  const { data, reload } = useApi<{ friends: FriendDTO[] }>('/api/friends');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<UserBrief[]>([]);

  useEffect(() => {
    const term = q.trim().replace(/^@/, '');
    if (term.length < 2) return setFound([]);
    const t = setTimeout(() => {
      api<{ users: UserBrief[] }>(`/api/users/search?q=${encodeURIComponent(term)}`)
        .then((r) => setFound(r.users))
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function add(userName: string) {
    try {
      const r = await post<{ status: string }>('/api/friends', { userName });
      toast(r.status === 'ACCEPTED' ? `You and @${userName} are now friends.` : `Friend request sent to @${userName}.`, 'success');
      setQ('');
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }
  async function accept(id: string) {
    try {
      await post(`/api/friends/${id}`);
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }
  async function remove(id: string) {
    try {
      await del(`/api/friends/${id}`);
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  const list = data?.friends ?? [];
  const incoming = list.filter((f) => f.status === 'INCOMING');
  const accepted = list.filter((f) => f.status === 'ACCEPTED');
  const outgoing = list.filter((f) => f.status === 'OUTGOING');
  const known = new Set(list.map((f) => f.id));

  return (
    <Screen nav title="Friends">
      <TitleBar title="Add A Friend" back />
      <div className="px-5">
        <div className="relative">
          <IconSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60" />
          <input className="field pl-11" placeholder="Search by username" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search by username" autoCapitalize="none" />
        </div>
        {found.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-[20px] bg-black/50 p-2">
            {found.map((u) => (
              <li key={u.id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
                <Avatar src={u.avatarUrl} name={u.userName} size={38} ring={u.ring} />
                <span className="flex-1 font-ui text-[14px] font-semibold text-white">{u.userName}</span>
                {known.has(u.id) ? (
                  <span className="font-ui text-[12px] text-white/50">Added</span>
                ) : (
                  <button type="button" onClick={() => add(u.userName)} className="flex items-center gap-1 rounded-full bg-lime px-3 py-1.5 font-din text-[11px] font-bold uppercase text-lime-ink">
                    <IconPlus size={12} /> Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {incoming.length > 0 && (
        <Section title="Requests">
          {incoming.map((f) => (
            <FriendRow key={f.id} f={f}>
              <button type="button" aria-label="Decline" onClick={() => remove(f.id)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
                <IconX size={15} />
              </button>
              <button type="button" aria-label="Accept" onClick={() => accept(f.id)} className="flex h-9 w-9 items-center justify-center rounded-full bg-lime text-lime-ink">
                <IconCheck size={15} />
              </button>
            </FriendRow>
          ))}
        </Section>
      )}

      <Section title={`Friends${accepted.length ? ` · ${accepted.length}` : ''}`}>
        {accepted.map((f) => (
          <FriendRow key={f.id} f={f} sub={f.statusText ?? (f.lat !== null ? 'Sharing location' : undefined)}>
            <button type="button" onClick={() => confirm(`Remove ${f.userName}?`) && remove(f.id)} className="font-ui text-[12px] text-white/50">
              Remove
            </button>
          </FriendRow>
        ))}
        {data && accepted.length === 0 && <EmptyState title="No friends yet" body="Search a username above to add your crew. Friends can see each other on the map when they choose to share." />}
      </Section>

      {outgoing.length > 0 && (
        <Section title="Sent">
          {outgoing.map((f) => (
            <FriendRow key={f.id} f={f} sub="Pending">
              <button type="button" onClick={() => remove(f.id)} className="font-ui text-[12px] text-white/50">
                Cancel
              </button>
            </FriendRow>
          ))}
        </Section>
      )}
    </Screen>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-7 font-din text-[14px] font-bold uppercase tracking-[0.1em] text-white/75">{title}</h2>
      <ul className="space-y-2 px-4">{children}</ul>
    </section>
  );
}

function FriendRow({ f, sub, children }: { f: FriendDTO; sub?: string; children: React.ReactNode }) {
  return (
    <li className="panel flex items-center gap-3 px-3 py-2.5">
      <Avatar src={f.avatarUrl} name={f.userName} size={44} ring={f.ring} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-ui text-[14px] font-semibold text-white">{f.userName}</span>
        {sub && <span className="block truncate font-ui text-[12px] text-white/55">{sub}</span>}
      </span>
      <span className="flex items-center gap-2">{children}</span>
    </li>
  );
}

Friends.auth = true;
export default Friends;
