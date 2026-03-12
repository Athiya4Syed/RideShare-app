const CACHE_NAME = 'rideshare-v2';
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
  console.log('📦 SW installing...');
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  console.log('✅ SW activated!');
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