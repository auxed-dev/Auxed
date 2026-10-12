import { media } from '@/lib/db/schema';
import { route, body, requireUser, str, bad, rateLimit } from '@/lib/server/http';
import { newId } from '@/lib/server/crypto';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const MAX_BYTES = 2.5 * 1024 * 1024;
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
};

/** Upload an image as a data URL (the client resizes/compresses first). Returns its public URL. */
export default route({
  async POST(ctx) {
    const user = requireUser(ctx);
    rateLimit(`upload:${user.id}`, 30, 60 * 60_000);
    const dataUrl = str(body(ctx).data, 'Image', { max: 4_000_000 });
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) throw bad('Upload a JPEG, PNG or WebP image.');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > MAX_BYTES) throw bad('That image is too large (2.5MB max).');
    if (!SIGNATURES[m[1]](bytes)) throw bad('That file is not a valid image.');
    const id = newId();
    await ctx.db.insert(media).values({ id, ownerId: user.id, mime: m[1], data: bytes, bytes: bytes.length });
    return { url: `/api/media/${id}` };
  },
});
