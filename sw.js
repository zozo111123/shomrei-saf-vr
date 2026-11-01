// sw.js - keeps the simulation on the device after the first visit, so a headset can run it without internet.
// Code and texts (html, js, json) come from the network when there is one, so fixes always arrive; the cache is
// the fallback offline. Media (mp4, mp3, png, fonts) come from the cache first: they are large and never change
// under the same name.
const VERSION = 'sim-v3';
const MEDIA = /\.(mp4|mp3|png|jpg|woff2?|ttf)(\?|$)/;
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    if (MEDIA.test(e.request.url)) {
      const hit = await c.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }
    try {
      const r = await fetch(e.request);
      if (r.ok || r.type === 'opaque') c.put(e.request, r.clone());
      return r;
    } catch (err) {
      const hit = await c.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
