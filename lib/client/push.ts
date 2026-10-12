import { api, del, post } from './api';

export type PushState = 'unsupported' | 'denied' | 'default' | 'granted';

export function pushSupport(): PushState {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return Notification.permission as PushState;
}

/** iPhone only allows web push from the home-screen app. */
export const isIosBrowser = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window.matchMedia?.('(display-mode: standalone)').matches);

function b64ToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscription(): Promise<PushSubscription> {
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  const { publicKey } = await api<{ publicKey: string | null }>('/api/push/key');
  if (!publicKey) throw new Error('Notifications are not set up on this server yet.');
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
}

/**
 * Turn on notifications for this phone. Pass a set id to show its live "now playing" card on the
 * lock screen (with 🔥 / 🙌 / Request actions), or null to stop the live card.
 */
export async function enablePush(livePerformanceId?: string | null) {
  if (pushSupport() === 'unsupported') throw new Error(isIosBrowser() ? 'On iPhone, add AUXED to your Home Screen first (Share → Add to Home Screen), then turn this on.' : 'This browser does not support notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them for AUXED in your browser settings.');
  const sub = await subscription();
  await post('/api/push/subscribe', { subscription: sub.toJSON(), ...(livePerformanceId !== undefined ? { livePerformanceId } : {}) });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await del('/api/push/subscribe', { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe();
}

export async function currentPushEndpoint() {
  if (pushSupport() === 'unsupported') return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription())?.endpoint ?? null;
}
