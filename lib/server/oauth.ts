import { createHash, createPrivateKey, sign } from 'crypto';
import { and, eq } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { DB } from '../db';
import { oauthAccounts, users } from '../db/schema';
import type { Role } from '../types';
import { createAccount, USERNAME_RE } from './accounts';
import { token } from './crypto';
import { appUrl } from './http';
import { appendCookie } from './session';

export type OAuthProvider = 'google' | 'apple';
const STATE_COOKIE = 'auxed_oauth';

export function providerEnabled(p: OAuthProvider): boolean {
  if (p === 'google') return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
}

const callbackUrl = (req: NextApiRequest, p: OAuthProvider) => `${appUrl(req)}/api/auth/oauth/${p}/callback`;
const b64url = (buf: Buffer) => buf.toString('base64url');

/** Builds the provider authorize URL and stores state + PKCE verifier in a short-lived cookie. */
export function startOAuth(req: NextApiRequest, res: NextApiResponse, p: OAuthProvider, role: Exclude<Role, 'ADMIN'>): string {
  const state = token(24);
  const verifier = token(48);
  const payload = Buffer.from(JSON.stringify({ state, verifier, role })).toString('base64url');
  // Apple posts the callback cross-site (form_post), so its cookie must be SameSite=None.
  const sameSite = p === 'apple' ? 'None' : 'Lax';
  const secure = p === 'apple' || process.env.NODE_ENV === 'production';
  appendCookie(res, `${STATE_COOKIE}=${payload}; Path=/api/auth/oauth; HttpOnly; SameSite=${sameSite}; Max-Age=600${secure ? '; Secure' : ''}`);
  if (p === 'google') {
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: callbackUrl(req, p),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    })}`;
  }
  return `https://appleid.apple.com/auth/authorize?${new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID!,
    redirect_uri: callbackUrl(req, p),
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'name email',
    state,
  })}`;
}

function readState(req: NextApiRequest): { state: string; verifier: string; role: Exclude<Role, 'ADMIN'> } | null {
  const raw = req.cookies[STATE_COOKIE];
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function decodeJwt(jwt: string): Record<string, any> {
  const [, payload] = jwt.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

function appleClientSecret(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'ES256', kid: process.env.APPLE_KEY_ID })));
  const body = b64url(
    Buffer.from(JSON.stringify({ iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: process.env.APPLE_CLIENT_ID })),
  );
  const key = createPrivateKey((process.env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'));
  const sig = sign('sha256', Buffer.from(`${header}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${header}.${body}.${b64url(sig)}`;
}

interface Identity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/**
 * Exchanges the authorization code server-to-server. The ID token is received directly from the
 * provider over TLS with our client credentials, so its claims can be trusted (OIDC Core 3.1.3.7).
 */
export async function finishOAuth(req: NextApiRequest, p: OAuthProvider): Promise<{ identity: Identity; role: Exclude<Role, 'ADMIN'> }> {
  const params = req.method === 'POST' ? (req.body as Record<string, string>) : (req.query as Record<string, string>);
  const saved = readState(req);
  if (!saved || !params.state || params.state !== saved.state) throw new Error('OAuth state mismatch');
  if (!params.code) throw new Error('Missing authorization code');
  if (p === 'google') {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code: params.code,
        code_verifier: saved.verifier,
        grant_type: 'authorization_code',
        redirect_uri: callbackUrl(req, p),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.id_token) throw new Error(`Google token exchange failed: ${data.error ?? res.status}`);
    const claims = decodeJwt(data.id_token);
    if (claims.aud !== process.env.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) {
      throw new Error('Unexpected Google token audience/issuer');
    }
    return { role: saved.role, identity: { sub: claims.sub, email: claims.email ?? null, emailVerified: !!claims.email_verified, name: claims.name ?? null } };
  }
  const res = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.APPLE_CLIENT_ID!,
      client_secret: appleClientSecret(),
      code: params.code,
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl(req, p),
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.id_token) throw new Error(`Apple token exchange failed: ${data.error ?? res.status}`);
  const claims = decodeJwt(data.id_token);
  if (claims.aud !== process.env.APPLE_CLIENT_ID || claims.iss !== 'https://appleid.apple.com') throw new Error('Unexpected Apple token audience/issuer');
  let name: string | null = null;
  try {
    const u = params.user ? JSON.parse(params.user) : null;
    name = u?.name ? [u.name.firstName, u.name.lastName].filter(Boolean).join(' ') : null;
  } catch {
    /* Apple only sends the name on first sign-in */
  }
  return {
    role: saved.role,
    identity: { sub: claims.sub, email: claims.email ?? null, emailVerified: claims.email_verified === true || claims.email_verified === 'true', name },
  };
}

/** Finds or creates the Auxed user for an OAuth identity and returns its id. */
export async function upsertOAuthUser(db: DB, p: OAuthProvider, identity: Identity, role: Exclude<Role, 'ADMIN'>): Promise<string> {
  const linked = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, p), eq(oauthAccounts.providerAccountId, identity.sub)))
    .limit(1);
  if (linked[0]) return linked[0].userId;
  let userId: string | null = null;
  if (identity.email && identity.emailVerified) {
    const existing = await db.select().from(users).where(eq(users.email, identity.email.toLowerCase())).limit(1);
    userId = existing[0]?.id ?? null;
  }
  if (!userId) {
    if (!identity.email) throw new Error('The provider did not share an email address.');
    const base = (identity.name ?? identity.email.split('@')[0]).replace(/[^A-Za-z0-9_.]/g, '').slice(0, 18) || 'auxee';
    let userName = base.length >= 3 ? base : `${base}auxee`;
    for (let i = 0; i < 20; i++) {
      const taken = await db.select({ id: users.id }).from(users).where(eq(users.userNameKey, userName.toLowerCase())).limit(1);
      if (!taken[0] && USERNAME_RE.test(userName)) break;
      userName = `${base.slice(0, 16)}${Math.floor(Math.random() * 9000 + 1000)}`;
    }
    userId = await createAccount(db, { userName, email: identity.email, password: null, role, verified: identity.emailVerified });
  }
  await db.insert(oauthAccounts).values({ provider: p, providerAccountId: identity.sub, userId }).onConflictDoNothing();
  return userId;
}

export function clearOAuthCookie(res: NextApiResponse) {
  appendCookie(res, `${STATE_COOKIE}=; Path=/api/auth/oauth; HttpOnly; Max-Age=0`);
}
