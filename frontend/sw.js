const CACHE_NAME = 'rideshare-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/auth.html',
  '/app.js',
  '/auth.js',
  '/style.css',
  '/auth.css',
  '/manifest.json',
  '/icons/icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css',
  'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js',
];

// ─── INSTALL ─────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('📦 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Caching app assets');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// ─── ACTIVATE ────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker activated!');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// ─── FETCH ───────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Skip non-GET and backend API requests
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('onrender.com')) return;
  if (event.request.url.includes('nominatim')) return;
  if (event.request.url.includes('openstreetmap.org/tiles')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache new requests
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ─── PUSH NOTIFICATIONS (Ready for Day 12!) ──────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  self.registration.showNotification(data.title || 'RideShare', {
    body: data.body || 'Your ride update',
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});