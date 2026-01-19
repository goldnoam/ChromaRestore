const CACHE_NAME = 'chroma-restore-v5';
const ASSETS = [
  './',
  'index.css',
  'manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Using individual add calls to be more resilient. 
      // Relative paths ensure better resolution regardless of root vs public serving nuances.
      return Promise.allSettled(
        ASSETS.map(url => 
          cache.add(url).catch(err => console.debug(`Pre-caching skip for ${url}:`, err))
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networked = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const cacheCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, cacheCopy);
            });
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./') || caches.match('/index.html');
          }
          return null;
        });

      // Stale-while-revalidate strategy
      return cached || networked;
    })
  );
});