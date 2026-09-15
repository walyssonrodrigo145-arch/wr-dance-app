// WR MusicPro Service Worker — v7 Web Push VAPID (PRD_PUSH_VAPID_001, 2026-09-02)
// Push nativo (RFC 8292) como caminho primário — sem SDK/config do Firebase.
// Aba focada: suprime a notificação do SO e repassa o payload via postMessage (toast in-app).

function logSWEvent(eventName, data, startTime = null) {
  const duration = startTime ? `${(performance.now() - startTime).toFixed(2)}ms` : 'N/A';
  const timestamp = new Date().toISOString();
  console.log(`[SW][${timestamp}][${eventName}][Duration: ${duration}]`, data || '');
}

// ─── Eventos de Ciclo de Vida do SW ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  const start = performance.now();
  logSWEvent('install', { scope: self.registration?.scope });
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => logSWEvent('install_success', null, start))
      .catch((err) => logSWEvent('install_error', { error: err.message, stack: err.stack }, start))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const start = performance.now();
  logSWEvent('activate', { scope: self.registration?.scope });
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            logSWEvent('cache_delete', { cache });
            return caches.delete(cache);
          }
        })
      )
    ).then(() => logSWEvent('activate_success', null, start))
     .catch((err) => logSWEvent('activate_error', { error: err.message, stack: err.stack }, start))
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  logSWEvent('message', { origin: event.origin, data: event.data, sourceId: event.source?.id });
});

self.addEventListener('messageerror', (event) => {
  logSWEvent('messageerror', { error: event });
});

self.addEventListener('sync', (event) => {
  logSWEvent('sync', { tag: event.tag });
});

// ─── PWA Cache ───────────────────────────────────────────────────────────────
const CACHE_NAME = 'wr-music-cache-v9';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (
    url.includes('/api/') ||
    url.startsWith('chrome-extension') ||
    url.includes('googleapis.com') ||
    url.includes('gstatic.com') ||
    url.includes('google.com') ||
    // Thumbnails do YouTube: nunca interceptar (evita falha de capa se o SW
    // responder errado e mantém o carregamento direto da CDN oficial)
    url.includes('ytimg.com')
  ) {
    logSWEvent('fetch_bypassed_api', { url, method: event.request.method });
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});

// ─── Push nativo (Web Push VAPID — caminho primário) ─────────────────────────
self.addEventListener('push', (event) => {
  const start = performance.now();
  logSWEvent('push_raw_event_received', { hasData: !!event.data });

  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
    logSWEvent('push_payload_parsed', data);
  } catch (e) {
    logSWEvent('push_event_error', { error: e.message, stack: e.stack }, start);
    data = {};
  }

  event.waitUntil((async () => {
    // Supressão em foreground (CA-003): aba visível não exibe notificação do SO;
    // o payload é repassado à página via postMessage (toast in-app).
    try {
      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const focused = clientList.find((c) => c.visibilityState === 'visible');
      if (focused) {
        logSWEvent('foreground_suppressed_postMessage', null, start);
        focused.postMessage({ type: 'push-received', payload: data });
        return;
      }
    } catch (e) {
      logSWEvent('foreground_check_error', { error: e.message }, start);
    }

    const title = data.notification?.title || data.title || 'WR MusicPro 🎵';
    const options = {
      body: data.notification?.body || data.body || 'Você tem um novo aviso.',
      icon: data.notification?.icon || '/icon-192.png',
      badge: data.notification?.badge || '/icon-badge.png',
      data: {
        url: data.data?.url || data.fcmOptions?.link || data.url || '/',
        ...data
      },
      vibrate: [300, 100, 300],
      requireInteraction: true,
      tag: 'wr-music-push-' + Date.now()
    };
    try {
      await self.registration.showNotification(title, options);
      logSWEvent('showNotification_success', null, start);
    } catch (err) {
      logSWEvent('showNotification_error', { error: err.message, stack: err.stack }, start);
    }
  })());
});

// ─── Eventos de Notificação ──────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  logSWEvent('notificationclick', { title: event.notification?.title, tag: event.notification?.tag, action: event.action });
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});

self.addEventListener('notificationclose', (event) => {
  logSWEvent('notificationclose', { title: event.notification?.title, tag: event.notification?.tag });
});
