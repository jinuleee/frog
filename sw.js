// Offline support: network first so new deploys show at once; the cache is the fallback.
const CACHE = 'frog';
const FILES = ['./', 'style.css', 'app.js', 'core.js', 'vendor/showdown.min.js', 'vendor/purify.es.mjs', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    // a redirect here is usually the Cloudflare Access login page; never cache that as the app
    if (r.ok && !r.redirected) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./'))));
});
