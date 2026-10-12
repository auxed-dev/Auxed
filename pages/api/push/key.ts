import { route } from '@/lib/server/http';
import { vapidPublicKey } from '@/lib/server/push';

export default route({
  GET() {
    return { publicKey: vapidPublicKey() };
  },
});
