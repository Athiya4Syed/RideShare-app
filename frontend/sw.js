const CACHE_NAME = 'rideshare-v3';
const ASSETS = [
  '/index.html',
  '/auth.html',
  '/app.js',
  '/auth.js',
  '/style.css',
  '/auth.css',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('onrender.com')) return;
  if (e.request.url.includes('nominatim')) return;
  if (e.request.url.includes('tile.openstreetmap')) return;
  if (e.request.url.includes('socket.io')) return;
  if (e.request.url.includes('unpkg.com')) return;

  e.respondWith(
    fetch(e.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request)
        .then(cached => cached || caches.match('/index.html'))
      )
  );
});

// ─── PUSH NOTIFICATIONS ──────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'RideShare', {
      body: data.body || 'You have a new notification',
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      vibrate: [100, 50, 100],
      data: { url: data.url || '/' },
      actions: [
        { action: 'open', title: '🚗 Open App' },
        { action: 'close', title: '✕ Dismiss' }
      ]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data.url);
    })
  );
});