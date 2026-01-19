
const CACHE_NAME = 'chroma-restore-v16';
const ASSETS = [
  './',
  './index.html',
  './index.css',
  './manifest.json',
  './index.tsx',
  './App.tsx',
  './types.ts',
  './i18n.ts'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(e => console.debug('Pre-cache skip:', url)))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        // Force delete ALL old caches to clear stale index.html pointing to /assets/
        return caches.delete(key);
      })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Only handle local requests
  if (url.origin !== self.location.origin) return;

  // Bypass cache for Adsense and external scripts
  if (url.hostname.includes('googlesyndication') || url.hostname.includes('google-analytics')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return null;
      });
    })
  );
});
