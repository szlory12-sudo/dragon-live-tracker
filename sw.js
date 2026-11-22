const CACHE_NAME = 'dragon-live-friends-beta-v29';
const APP_FILES = [
  './', './index.html', './dashboard.html', './beta-feedback-center.html', './manifest.webmanifest', './dragon-icon.svg',
  './automatic-engine/src/browser-dashboard-bridge.js',
  './automatic-engine/src/dashboard-bridge.js',
  './automatic-engine/src/event-normalizer.js',
  './automatic-engine/src/tracker.js',
  './automatic-engine/src/analytics.js',
  './automatic-engine/src/analytics-export.js',
  './automatic-engine/src/persistence.js'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('dragon-live-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {
      const clone = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
    }
    return response;
  }).catch(() => caches.match('./dashboard.html'))));
});
