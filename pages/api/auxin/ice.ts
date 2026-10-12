import { route } from '@/lib/server/http';
import { iceServers } from '@/lib/server/services/auxin';

export default route({
  GET() {
    return { iceServers: iceServers() };
  },
});
