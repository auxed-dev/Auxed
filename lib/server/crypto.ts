import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password: string, salt: Buffer, opts = SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, opts.keylen, { N: opts.N, r: opts.r, p: opts.p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** Format: scrypt$N$r$p$saltB64$hashB64 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [algo, N, r, p, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    keylen: expected.length,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function token(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function newId(): string {
  return randomBytes(12).toString('base64url');
}

export function hmacHex(algo: 'sha256' | 'sha512', secret: string | Buffer, payload: string | Buffer): string {
  return createHmac(algo, secret).update(payload).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* ------------------------------------------------ encryption at rest (OAuth tokens) */


function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET is required in production.');
  return createHash('sha256').update(`auxed-token-key:${secret ?? 'development-only-secret'}`).digest();
}

/** AES-256-GCM. Output: iv.tag.ciphertext (base64url). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(blob: string | null | undefined): string | null {
  if (!blob) return null;
  try {
    const [iv, tag, enc] = blob.split('.').map((x) => Buffer.from(x, 'base64url'));
    const d = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
