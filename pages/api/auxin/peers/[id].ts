import { route, body, requireUser, query, sdp } from '@/lib/server/http';
import { answerPeer, closePeer, listenerPoll } from '@/lib/server/services/auxin';

/** WebRTC signalling: listener polls for the answer (GET); broadcaster answers (PUT); either side closes (DELETE). */
export default route({
  async GET(ctx) {
    return listenerPoll(ctx.db, requireUser(ctx), query(ctx, 'id')!);
  },
  async PUT(ctx) {
    return answerPeer(ctx.db, requireUser(ctx), query(ctx, 'id')!, sdp(body(ctx).answer, 'Answer'));
  },
  async DELETE(ctx) {
    return closePeer(ctx.db, requireUser(ctx), query(ctx, 'id')!);
  },
});
