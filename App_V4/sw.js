/* RoyalRayZone Unified PWA Service Worker
   هدفه: منع تعارض الـ SW (sw.js vs service-worker.js) + تثبيت Offline/Cache بدون فشل install.
   ملاحظة: لا يَكِش ملفات كبيرة/ديناميكية (PDF runtime, blobs) بشكل مقصود.
*/

const CACHE_VERSION = 'rrz-unified-v1.1';
const CORE = [
  './',
  'index.html',
  'subscription.html',
  'agreement.html',
  'patient-registration.html',
  'dashboard.html',
  'payment.html',

  // Core modules
  'Ceph.html',
  'ceph.html',
  'pano.html',
  'shared/aiClient.js',
  'panorama/style.css',
  'panorama/app.js',
  'photo.html',
  'analysis.html',
  'voice-report.html',
  'ai-assistant.html',
  'Ask ai.png',

  // Photo workflows
  'workflow.html',
  'workflow2.html',
  'workflow3.html',
  'workflow4.html',
  'workflow5.html',
  'workflow6.html',
  'workflow7.html',
  'workflow8.html',
  'workflow9.html',

  // Reference images
  'referance image.png',
  'referance image2.png',
  'referance image3.png',
  'referance image4.png',
  'referance image5.png',
  'referance image6.png',
  'referance image7.png',
  'referance image8.png',
  'referance image9.png',

  // Icons/manifest
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',

  // CBCT module (داخل /cbct)
  'cbct/dashboard.html',
  'cbct/ceph.html',
  'cbct/pano.html',
  'cbct/photo.html',
  'cbct/voice-report.html',
  'cbct/ai-assistant.html',
  'cbct/cbct.html',
  'cbct/manifest.json',
  'cbct/jszip.min.js',
  'cbct/daikon.min.js',
  'cbct/icon-192.png',
  'cbct/icon-512.png',
  'cbct/agreement.html',
  'cbct/Ask ai.png',
  'cbct/clinic photo.png',
  'cbct/voice to report.png',
  'cbct/ceph.png',
  'cbct/panorama.png',
  'cbct/cbct.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Cache core defensively: if any single asset fails, we still want SW to install.
    await Promise.all(
      CORE.map((url) => cache.add(url).catch(() => null))
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_VERSION ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

function isNavigationRequest(req){
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Strategy:
  // - HTML navigations: network-first (to reduce "stuck on old UI"), fallback to cache.
  // - Everything else: cache-first, then network, then offline message.

  if (isNavigationRequest(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, fresh.clone()).catch(() => null);
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        if (cached) return cached;
        // Fallbacks
        return (await caches.match('index.html')) || new Response('Offline', {status: 503});
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const resp = await fetch(req);
      const cache = await caches.open(CACHE_VERSION);
      cache.put(req, resp.clone()).catch(() => null);
      return resp;
    } catch (e) {
      return new Response('Offline', {
        status: 503,
        headers: {'Content-Type':'text/plain; charset=utf-8'}
      });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
