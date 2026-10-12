import { useRouter } from 'next/router';
import type { AuxedPage } from '../../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { EMPTY_VENUE, VenueForm } from '@/components/VenueForm';
import { useToast } from '@/components/Toast';
import { post, errorMessage } from '@/lib/client/api';

/** Register an establishment. */
const NewVenue: AuxedPage = () => {
  const router = useRouter();
  const toast = useToast();
  return (
    <Screen nav theme="purple" title="Register a venue">
      <TitleBar title="Register A Venue" back="/owner" />
      <section className="glow-card mx-[10px] px-5 pb-8 pt-6">
        <VenueForm
          initial={EMPTY_VENUE}
          submitLabel="Register Venue"
          onSubmit={async (v) => {
            try {
              const { id } = await post<{ id: string }>('/api/owner/venues', v);
              toast(`${v.name} is on AUXED.`, 'success');
              router.replace(`/owner/venues/${id}?created=1`);
            } catch (err) {
              toast(errorMessage(err), 'error');
            }
          }}
        />
      </section>
    </Screen>
  );
};

NewVenue.auth = ['OWNER'];
export default NewVenue;
