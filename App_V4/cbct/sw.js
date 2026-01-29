const CACHE_NAME = 'rrz-cbct-v1';
const ASSETS = [
  './cbct.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // External Libraries needed offline
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/daikon/1.2.42/daikon.min.js',
  'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js',
  'https://unpkg.com/daikon@1.2.42/release/current/daikon-min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});