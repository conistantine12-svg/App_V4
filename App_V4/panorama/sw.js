const CACHE_NAME = 'rrz-pano-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([
      './',
      './pano.html',
      './manifest.json',
      './style.css',
      './app.js'
    ]))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    ))
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // App shell: prefer cache for navigation
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./pano.html').then((cached) => cached || fetch(req))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((response) => response || fetch(req))
  );
});