import Link from 'next/link';
import type { AuxedPage } from '../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { EmptyState } from '@/components/ui';
import { Skeleton } from '@/components/Loader';
import { useApi } from '@/lib/client/useApi';
import { longDate } from '@/lib/format';
import type { PerformanceStatus, Track } from '@/lib/types';

interface SetItem {
  id: string;
  title: string;
  venue: string;
  startsAt: string;
  status: PerformanceStatus;
  setlist: Track[];
}

/** Rewind Major Moments: your past sets, ready to relive (queue, chat, reactions). */
const Moments: AuxedPage = () => {
  const { data } = useApi<{ sets: SetItem[] }>('/api/artist/sets');
  const past = (data?.sets ?? []).filter((s) => s.status === 'ENDED');
  return (
    <Screen nav theme="green" title="Rewind Major Moments">
      <TitleBar title="Rewind Major Moments" back="/artist" />
      <div className="flex flex-col gap-3 px-4">
        {!data && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[84px]" />)}
        {past.map((s) => (
          <Link key={s.id} href={`/sets/${s.id}`} className="panel flex items-center justify-between gap-3 px-5 py-4">
            <span className="min-w-0">
              <span className="block truncate font-din text-[15px] font-bold uppercase tracking-wide text-white">{s.title}</span>
              <span className="block truncate font-ui text-[12px] text-white/60">
                {s.venue} · {longDate(s.startsAt)}
              </span>
            </span>
            <span className="shrink-0 font-din text-[11px] font-bold uppercase tracking-wider text-white/70">{s.setlist.length} tracks ›</span>
          </Link>
        ))}
        {data && past.length === 0 && <EmptyState title="No past sets yet" body="After your first set ends, you can relive the crowd's requests and chat here." />}
      </div>
    </Screen>
  );
};

Moments.auth = ['PERFORMER'];
export default Moments;
