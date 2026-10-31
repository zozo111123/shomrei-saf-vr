// sw.js - keeps the simulation on the device after the first visit, so a headset can run it without internet.
// Cache-first for everything the page loads (its own files, three.js from the CDN, the fonts); a new VERSION
// replaces the whole cache.
const VERSION = 'sim-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const hit = await c.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const r = await fetch(e.request);
    if (r.ok || r.type === 'opaque') c.put(e.request, r.clone());
    return r;
  })());
});
