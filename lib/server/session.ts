import type { NextApiRequest, NextApiResponse } from 'next';
import { and, eq, gt } from 'drizzle-orm';
import type { DB } from '../db';
import { performers, sessions, users } from '../db/schema';
import type { SessionUser } from '../types';
import { newId, sha256, token } from './crypto';

export const SESSION_COOKIE = 'auxed_session';
const SESSION_DAYS = 30;
const RENEW_WHEN_DAYS_LEFT = 15;

export type UserRow = typeof users.$inferSelect;
export type AuthedUser = UserRow & { performerId: string | null; sessionId: string };

function cookie(name: string, value: string, maxAgeSec: number): string {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function appendCookie(res: NextApiResponse, value: string) {
  const prev = res.getHeader('Set-Cookie');
  const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
  res.setHeader('Set-Cookie', [...list, value]);
}

export async function createSession(db: DB, userId: string, req: NextApiRequest, res: NextApiResponse) {
  const raw = token(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({
    id: sha256(raw),
    userId,
    expiresAt,
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
    ip: String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').slice(0, 100),
  });
  appendCookie(res, cookie(SESSION_COOKIE, raw, SESSION_DAYS * 86400));
}

export async function destroySession(db: DB, req: NextApiRequest, res: NextApiResponse) {
  const raw = req.cookies[SESSION_COOKIE];
  if (raw) await db.delete(sessions).where(eq(sessions.id, sha256(raw)));
  appendCookie(res, cookie(SESSION_COOKIE, '', 0));
}

export async function destroyAllSessions(db: DB, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function getSessionUser(db: DB, req: NextApiRequest, res: NextApiResponse): Promise<AuthedUser | null> {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw || raw.length > 100) return null;
  const id = sha256(raw);
  const rows = await db
    .select({ user: users, session: sessions, performerId: performers.id })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(performers, eq(performers.userId, users.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const daysLeft = (row.session.expiresAt.getTime() - Date.now()) / 86400_000;
  if (daysLeft < RENEW_WHEN_DAYS_LEFT) {
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    appendCookie(res, cookie(SESSION_COOKIE, raw, SESSION_DAYS * 86400));
  }
  return { ...row.user, performerId: row.performerId ?? null, sessionId: id };
}

export function toSessionUser(u: UserRow & { performerId: string | null }): SessionUser {
  return {
    id: u.id,
    userName: u.userName,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatarUrl,
    ring: u.ring,
    walletCents: u.walletCents,
    emailVerified: !!u.emailVerifiedAt,
    performerId: u.performerId,
    shareLocation: u.shareLocation,
    spendCapCents: u.spendCapCents ?? null,
  };
}

export { newId };
