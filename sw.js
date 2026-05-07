// {{COMPANY_NAME}} Cockpit Service Worker (Sprint 15)
const CACHE_NAME = 'brand-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never cache API or login
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__')) {
    return;  // pass through
  }
  // Cache-first for static assets, network-first for HTML
  if (url.pathname === '/leads-geo.json' || url.pathname.startsWith('/icon-') || url.pathname === '/manifest.json') {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(r => {
        if (r.ok) {
          const clone = r.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return r;
      }))
    );
  }
});
