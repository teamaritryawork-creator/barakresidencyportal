const CACHE_NAME = 'br-pro-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './favicon.ico',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only intercept same-origin or specific CDN requests
  if (event.request.url.startsWith(self.location.origin) || event.request.url.includes('cdn.jsdelivr')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        // Return cached version if found, otherwise fetch from network
        return response || fetch(event.request).then((fetchRes) => {
           return caches.open(CACHE_NAME).then((cache) => {
             // Cache new requests dynamically (like the logo if not pre-cached)
             if(event.request.method === 'GET') {
                cache.put(event.request.url, fetchRes.clone());
             }
             return fetchRes;
           });
        });
      }).catch(() => {
        // Fallback for offline mode if the resource isn't cached (e.g. index.html)
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      })
    );
  }
});
