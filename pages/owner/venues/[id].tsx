import Link from 'next/link';
import { useRouter } from 'next/router';
import type { AuxedPage } from '../../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { VenueForm } from '@/components/VenueForm';
import { Loader } from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { useApi } from '@/lib/client/useApi';
import { patch, errorMessage } from '@/lib/client/api';
import type { VenueDTO } from '@/lib/types';

/** Edit a venue + share its door link (print it as a QR code at the entrance). */
const EditVenue: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const { data, reload } = useApi<{ venues: VenueDTO[] }>('/api/owner/venues');
  const venue = data?.venues.find((v) => v.id === id);
  if (!data) return <Loader />;
  if (!venue)
    return (
      <Screen nav theme="purple" title="Venue">
        <TitleBar title="Venue" back="/owner/venues" />
        <p className="px-6 font-ui text-white/70">Venue not found.</p>
      </Screen>
    );
  const doorLink = typeof window !== 'undefined' ? `${window.location.origin}/venues/${venue.id}` : `/venues/${venue.id}`;

  return (
    <Screen nav theme="purple" title={venue.name}>
      <TitleBar title="Edit Venue" back="/owner/venues" />
      <section className="panel mx-4 mb-4 px-5 py-4">
        <p className="font-din text-[12px] font-bold uppercase tracking-wider text-white/70">Door link</p>
        <p className="mt-1 break-all font-ui text-[13px] text-white">{doorLink}</p>
        <p className="mt-1 font-ui text-[11px] text-white/50">Print this as a QR code at your door and tables — it opens whatever set is live here, no app install needed.</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(doorLink);
                toast('Door link copied.', 'success');
              } catch {
                toast(doorLink);
              }
            }}
            className="rounded-full bg-white/10 px-4 py-2 font-din text-[12px] font-bold uppercase tracking-wider text-white"
          >
            Copy link
          </button>
          <Link href={`/venues/${venue.id}`} className="rounded-full bg-white/10 px-4 py-2 font-din text-[12px] font-bold uppercase tracking-wider text-white">
            Open
          </Link>
        </div>
      </section>
      <section className="glow-card mx-[10px] px-5 pb-8 pt-6">
        <VenueForm
          initial={venue}
          submitLabel="Save Changes"
          onSubmit={async (v) => {
            try {
              await patch(`/api/owner/venues/${venue.id}`, v);
              toast('Venue saved.', 'success');
              reload();
            } catch (err) {
              toast(errorMessage(err), 'error');
            }
          }}
        />
      </section>
    </Screen>
  );
};

EditVenue.auth = ['OWNER'];
export default EditVenue;
