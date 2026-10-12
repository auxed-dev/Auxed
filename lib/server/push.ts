/**
 * Notifications that reach people outside the app.
 *  - Web push (PWA, Android Chrome, iOS 16.4+ home-screen web app): the "now playing" card with
 *    reaction / request actions, and "your request is playing" alerts. VAPID keys come from
 *    VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (development generates and stores a pair in ./data).
 *  - Native app (iOS Live Activity / APNs, Android FCM): see native/README.md. Live Activity
 *    updates are sent through APNs when APNS_* is configured.
 */
import fs from 'fs';
import http2 from 'http2';
import path from 'path';
import { createPrivateKey, sign } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import webpush from 'web-push';
import type { DB } from '../db';
import { nativePushTokens, pushSubscriptions } from '../db/schema';
import type { NowPlaying } from '../types';

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  performanceId?: string;
  image?: string | null;
  silent?: boolean;
  renotify?: boolean;
  actions?: { action: string; title: string }[];
}

let keys: { publicKey: string; privateKey: string } | null = null;

function vapidKeys() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else if (process.env.NODE_ENV !== 'production') {
    const file = path.join(process.cwd(), 'data', 'vapid.json');
    try {
      keys = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      keys = webpush.generateVAPIDKeys();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(keys));
    }
  } else {
    return null;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@auxed.app', keys!.publicKey, keys!.privateKey);
  return keys;
}

export const vapidPublicKey = () => vapidKeys()?.publicKey ?? null;

async function sendWeb(db: DB, subs: (typeof pushSubscriptions.$inferSelect)[], payload: PushPayload) {
  if (!subs.length || !vapidKeys()) return;
  const body = JSON.stringify(payload);
  const dead: string[] = [];
  await Promise.all(
    subs.map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 600, urgency: payload.silent ? 'low' : 'normal' })
        .catch((err: { statusCode?: number }) => {
          if (err.statusCode === 404 || err.statusCode === 410) dead.push(s.endpoint);
        }),
    ),
  );
  if (dead.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, dead));
}

export async function notifyUser(db: DB, userId: string, payload: PushPayload) {
  try {
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    await sendWeb(db, subs, payload);
  } catch (err) {
    console.error('[push] notifyUser', err);
  }
}

const REACT_ACTIONS = [
  { action: 'react:🔥', title: '🔥' },
  { action: 'react:🙌', title: '🙌' },
  { action: 'request', title: '♪ Request' },
];

/** Update everyone's "now playing" card for a set (web push + iOS Live Activities). */
export async function notifyNowPlaying(db: DB, performanceId: string, venueName: string, np: NowPlaying | null) {
  if (!np) return;
  try {
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.livePerformanceId, performanceId));
    await sendWeb(db, subs, {
      title: `♪ ${np.track.title}`,
      body: `${np.track.artist} · live at ${venueName}`,
      tag: `live-${performanceId}`,
      url: `/sets/${performanceId}`,
      performanceId,
      image: np.track.artwork ?? null,
      silent: true,
      renotify: false,
      actions: REACT_ACTIONS,
    });
    const tokens = await db
      .select()
      .from(nativePushTokens)
      .where(and(eq(nativePushTokens.performanceId, performanceId), eq(nativePushTokens.kind, 'IOS_LIVE_ACTIVITY')));
    await Promise.all(
      tokens.map((t) =>
        apnsLiveActivity(t.token, {
          event: 'update',
          'content-state': { title: np.track.title, artist: np.track.artist, venue: venueName, endsAt: Math.round(new Date(np.startedAt).getTime() / 1000) + np.track.durationSec },
        }).catch(() => undefined),
      ),
    );
  } catch (err) {
    console.error('[push] notifyNowPlaying', err);
  }
}

/* ----------------------------------------------------------------- APNs (Live Activities) */

let apnsJwt: { value: string; at: number } | null = null;
export const apnsEnabled = () => !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY && process.env.APNS_BUNDLE_ID);

function apnsToken() {
  if (apnsJwt && Date.now() - apnsJwt.at < 40 * 60_000) return apnsJwt.value;
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: process.env.APNS_KEY_ID })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
  const key = createPrivateKey(process.env.APNS_PRIVATE_KEY!.replace(/\\n/g, '\n'));
  const sig = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  apnsJwt = { value: `${header}.${claims}.${sig}`, at: Date.now() };
  return apnsJwt.value;
}

/** Send an ActivityKit push (update / end, or start with a push-to-start token). */
export function apnsLiveActivity(deviceToken: string, aps: Record<string, unknown>): Promise<number> {
  if (!apnsEnabled()) return Promise.resolve(0);
  const host = process.env.APNS_PRODUCTION === 'true' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
  return new Promise((resolve, reject) => {
    const client = http2.connect(host);
    client.on('error', reject);
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${apnsToken()}`,
      'apns-topic': `${process.env.APNS_BUNDLE_ID}.push-type.liveactivity`,
      'apns-push-type': 'liveactivity',
      'apns-priority': '5',
      'content-type': 'application/json',
    });
    req.on('response', (h) => {
      resolve(Number(h[':status']));
      client.close();
    });
    req.on('error', (e) => {
      client.close();
      reject(e);
    });
    req.end(JSON.stringify({ aps: { timestamp: Math.floor(Date.now() / 1000), ...aps } }));
  });
}
