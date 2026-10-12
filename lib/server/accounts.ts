import { and, eq, gt, isNull } from 'drizzle-orm';
import type { NextApiRequest } from 'next';
import type { DB } from '../db';
import { authTokens, performers, users } from '../db/schema';
import type { Role } from '../types';
import { hashPassword, newId, sha256, token } from './crypto';
import { HttpError, appUrl, bad } from './http';
import { emailLayout, sendMail } from './mail';
import { DEFAULT_CONTROLS } from './services/core';

export const USERNAME_RE = /^[A-Za-z0-9_.]{3,24}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validatePassword(pw: string) {
  if (pw.length < 8) throw bad('Password must be at least 8 characters.');
  if (pw.length > 200) throw bad('Password is too long.');
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw bad('Password needs at least one letter and one number.');
}

export async function createAccount(
  db: DB,
  input: { userName: string; email: string; password: string | null; role: Exclude<Role, 'ADMIN'>; verified?: boolean },
) {
  const email = input.email.toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('Enter a valid email address.');
  if (!USERNAME_RE.test(input.userName)) throw bad('Username must be 3-24 letters, numbers, dots or underscores.');
  const clash = await db
    .select({ email: users.email, key: users.userNameKey })
    .from(users)
    .where(eq(users.email, email))
    .union(db.select({ email: users.email, key: users.userNameKey }).from(users).where(eq(users.userNameKey, input.userName.toLowerCase())));
  if (clash.some((c) => c.email === email)) throw new HttpError(409, 'An account with this email already exists. Log in instead.', 'EMAIL_TAKEN');
  if (clash.length) throw new HttpError(409, 'That username is taken.', 'USERNAME_TAKEN');
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id,
      userName: input.userName,
      userNameKey: input.userName.toLowerCase(),
      email,
      passwordHash: input.password ? await hashPassword(input.password) : null,
      role: input.role,
      emailVerifiedAt: input.verified ? new Date() : null,
    });
    if (input.role === 'PERFORMER') {
      await tx.insert(performers).values({ id: newId(), userId: id, name: input.userName, type: 'DJ', genres: [], controls: DEFAULT_CONTROLS });
    }
  });
  return id;
}

export async function issueToken(db: DB, userId: string, kind: 'VERIFY_EMAIL' | 'RESET_PASSWORD', ttlMs: number) {
  const raw = token(32);
  await db.insert(authTokens).values({ id: newId(), userId, kind, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlMs) });
  return raw;
}

export async function consumeToken(db: DB, raw: string, kind: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
  const rows = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.tokenHash, sha256(raw)), eq(authTokens.kind, kind), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .returning({ userId: authTokens.userId });
  return rows[0]?.userId ?? null;
}

export async function sendVerification(db: DB, req: NextApiRequest, user: { id: string; email: string; userName: string }) {
  const raw = await issueToken(db, user.id, 'VERIFY_EMAIL', 48 * 3600_000);
  const url = `${appUrl(req)}/verify?token=${raw}`;
  await sendMail({
    to: user.email,
    subject: 'Verify your Auxed account',
    text: `Hi ${user.userName},\n\nConfirm your email to finish joining the family: ${url}\n\nThis link expires in 48 hours.`,
    html: emailLayout('Confirm your email', `Hi ${user.userName}, tap below to finish joining the family. This link expires in 48 hours.`, { label: 'VERIFY EMAIL', url }),
  });
}

export async function sendPasswordReset(db: DB, req: NextApiRequest, user: { id: string; email: string; userName: string }) {
  const raw = await issueToken(db, user.id, 'RESET_PASSWORD', 3600_000);
  const url = `${appUrl(req)}/reset?token=${raw}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your Auxed password',
    text: `Hi ${user.userName},\n\nReset your password here: ${url}\n\nThis link expires in 1 hour. If you didn't ask for this, ignore this email.`,
    html: emailLayout('Reset your password', `Hi ${user.userName}, use the button below within the next hour. If you didn't ask for this, you can ignore this email.`, { label: 'RESET PASSWORD', url }),
  });
}

export function homeFor(role: Role): string {
  return role === 'PERFORMER' ? '/artist' : role === 'OWNER' ? '/owner' : '/home';
}
