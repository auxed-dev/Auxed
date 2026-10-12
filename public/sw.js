/*
 * AUXED service worker
 *  - offline shell + cached static assets (API calls always go to the network)
 *  - push: the lock-screen "now playing" card and request alerts, with one-tap actions
 *    (🔥 / 🙌 reactions are sent without opening the app; ♪ Request opens the request sheet).
 */
const VERSION = 'auxed-v2';
const SHELL = ['/', '/manifest.webmanifest', '/brand/auxed-a-256.png', '/icons/icon-192.png'];
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  event.waitUntil((DEV ? Promise.resolve() : caches.open(VERSION).then((c) => c.addAll(SHELL))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (DEV) return; // never cache during development
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/static/') || /^\/(art|brand|icons|integrations)\//.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }
  if (req.mode === 'navigate') event.respondWith(fetch(req).catch(() => caches.match('/')));
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'AUXED', body: event.data ? event.data.text() : '' };
  }
  const options = {
    body: data.body || '',
    tag: data.tag,
    renotify: !!data.renotify,
    silent: !!data.silent,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    image: data.image || undefined,
    requireInteraction: !!(data.tag && data.tag.indexOf('live-') === 0),
    data: { url: data.url || '/', performanceId: data.performanceId || null },
    actions: (data.actions || []).slice(0, 3),
  };
  event.waitUntil(self.registration.showNotification(data.title || 'AUXED', options));
});

self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  const { url, performanceId } = n.data || {};
  const action = event.action || '';
  if (action.indexOf('react:') === 0 && performanceId) {
    // React straight from the lock screen / notification shade.
    event.waitUntil(
      fetch(`/api/performances/${performanceId}/react-now`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'x-auxed-client': '1' },
        body: JSON.stringify({ text: action.slice(6) }),
      }).catch(() => undefined),
    );
    return; // keep the card showing
  }
  n.close();
  const target = action === 'request' && performanceId ? `/sets/${performanceId}?request=1` : url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate(target);
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
