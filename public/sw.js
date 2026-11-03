const CACHE_NAME = 'smart-frame-v14';
const STATIC_ASSETS = [
  '/',
  '/settings',
  '/manifest.webmanifest',
  '/css/style.css?v=13',
  '/js/app.js?v=13',
  '/icons/apple-touch-icon.png',
  '/icons/apple-touch-icon-180x180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Per API, SSE e stream radio/video: sempre diretta su rete
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/birthday') || url.pathname.includes('/stream') || event.request.headers.get('accept')?.includes('text/event-stream')) {
    return;
  }

  // Per pagine HTML: Network-first con fallback a cache per PWA offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Per asset statici: Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => {});

      return cached || fetchPromise;
    })
  );
});
