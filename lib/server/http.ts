import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb, type DB } from '../db';
import { getSessionUser, type AuthedUser } from './session';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const bad = (msg: string, code?: string) => new HttpError(400, msg, code);
export const unauthorized = (msg = 'Please log in to continue.') => new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = "You don't have access to that.") => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Not found.') => new HttpError(404, msg, 'NOT_FOUND');

export interface Ctx {
  req: NextApiRequest;
  res: NextApiResponse;
  db: DB;
  user: AuthedUser | null;
  ip: string;
}

type Handler = (ctx: Ctx) => Promise<unknown> | unknown;
type Methods = Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', Handler>>;

export function clientIp(req: NextApiRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0];
  return (first || req.socket.remoteAddress || 'unknown').trim();
}

/**
 * Wraps an API route: method dispatch, session lookup, CSRF protection and consistent JSON errors.
 * Mutations must carry the `x-auxed-client` header, which browsers can't send cross-site without a
 * CORS preflight we never allow.
 */
export function route(methods: Methods) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const method = (req.method ?? 'GET').toUpperCase() as keyof Methods;
    const fn = methods[method];
    res.setHeader('Cache-Control', 'no-store');
    if (!fn) {
      res.setHeader('Allow', Object.keys(methods).join(', '));
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    try {
      if (method !== 'GET' && req.headers['x-auxed-client'] !== '1') {
        throw new HttpError(403, 'Missing client header.', 'CSRF');
      }
      const db = await getDb();
      await (await import('./services/housekeeping')).housekeeping(db);
      const user = await getSessionUser(db, req, res);
      const result = await fn({ req, res, db, user, ip: clientIp(req) });
      if (!res.headersSent) res.status(200).json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        if (!res.headersSent) res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      console.error(`[api] ${req.method} ${req.url}`, err);
      if (!res.headersSent) res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
    }
  };
}

export function requireUser(ctx: Ctx): AuthedUser {
  if (!ctx.user) throw unauthorized();
  return ctx.user;
}

export function requireRole(ctx: Ctx, ...roles: AuthedUser['role'][]): AuthedUser {
  const user = requireUser(ctx);
  if (!roles.includes(user.role) && user.role !== 'ADMIN') throw forbidden();
  return user;
}

export function body<T = Record<string, unknown>>(ctx: Ctx): T {
  const b = ctx.req.body;
  if (!b || typeof b !== 'object') return {} as T;
  return b as T;
}

export function query(ctx: Ctx, key: string): string | undefined {
  const v = ctx.req.query[key];
  return Array.isArray(v) ? v[0] : v;
}

/* ------------------------------------------------------------ validation */

export function str(v: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return '';
    throw bad(`${field} is required.`);
  }
  if (typeof v !== 'string') throw bad(`${field} must be text.`);
  const s = v.trim();
  if (opts.min && s.length < opts.min) throw bad(`${field} must be at least ${opts.min} characters.`);
  if (opts.max && s.length > opts.max) throw bad(`${field} must be at most ${opts.max} characters.`);
  return s;
}

/** WebRTC session description, kept byte-for-byte: SDP must end in CRLF, so it can't be trimmed like other text. */
export function sdp(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v.startsWith('v=0')) throw bad(`${field} must be a session description.`);
  if (v.length > 20000) throw bad(`${field} is too long.`);
  return v;
}

export function num(v: unknown, field: string, opts: { min?: number; max?: number; int?: boolean; optional?: boolean } = {}): number {
  if ((v === undefined || v === null || v === '') && opts.optional) return NaN;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw bad(`${field} must be a number.`);
  if (opts.int && !Number.isInteger(n)) throw bad(`${field} must be a whole number.`);
  if (opts.min !== undefined && n < opts.min) throw bad(`${field} must be at least ${opts.min}.`);
  if (opts.max !== undefined && n > opts.max) throw bad(`${field} must be at most ${opts.max}.`);
  return n;
}

export function oneOf<T extends string>(v: unknown, field: string, options: readonly T[]): T {
  if (typeof v !== 'string' || !options.includes(v as T)) throw bad(`${field} must be one of: ${options.join(', ')}.`);
  return v as T;
}

export function isoDate(v: unknown, field: string): Date {
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw bad(`${field} must be a valid date.`);
  return d;
}

export function safeUrl(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = str(v, field, { max: 2048 });
  if (s.startsWith('/api/media/')) return s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') throw new Error();
    return u.toString();
  } catch {
    throw bad(`${field} must be an https link.`);
  }
}

/* ------------------------------------------------------------ rate limit */

const buckets = new Map<string, { count: number; reset: number }>();

/** Fixed-window limiter (per server instance). Use Redis/Upstash when running several instances. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 10_000) {
      buckets.forEach((v, k) => {
        if (v.reset < now) buckets.delete(k);
      });
    }
    return;
  }
  b.count += 1;
  if (b.count > limit) {
    const secs = Math.ceil((b.reset - now) / 1000);
    throw new HttpError(429, `Too many attempts. Try again in ${secs}s.`, 'RATE_LIMITED');
  }
}

export function appUrl(req: NextApiRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
  return `${proto}://${req.headers.host}`;
}
