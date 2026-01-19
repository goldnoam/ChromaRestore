const CACHE_NAME = 'chroma-restore-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/index.css',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use individual promises to avoid one failure blocking the entire installation.
      // This specifically addresses the 'addAll' Request failed error by allowing the worker to proceed 
      // even if one asset is missing or returns a non-200 status.
      return Promise.allSettled(
        ASSETS.map(url => 
          cache.add(url).catch(err => console.debug(`Failed to cache ${url}:`, err))
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
  // Only handle standard GET requests for internal caching logic.
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  // Only intercept requests for our own origin to avoid issues with cross-origin assets or Gemini API calls.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networked = fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const cacheCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, cacheCopy);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback for navigation requests when completely offline.
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html') || caches.match('/');
          }
          return null;
        });

      // Return cached version immediately if available, while updating cache in background (stale-while-revalidate).
      return cached || networked;
    })
  );
});