// Service worker: keeps the app itself (HTML, scripts, styles) available without a connection, so a page such as
// the table page still opens in a dead spot and shows the last known state. API requests are never cached here;
// the pages keep their own snapshot of the data they need.
//
// - Page loads: network first, so a new deployment arrives with the next load; offline the last page is used.
// - /assets/*: file names carry a content hash and never change, so cache first.
// Bump CACHE when this file changes in a way that needs the old cache gone.
const CACHE = 'dap-shell-v1';
const MAX_ASSETS = 200;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') event.respondWith(networkFirst(request, '/index.html'));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(request));
  else event.respondWith(networkFirst(request, request));
});

/** Every page of the single-page app is the same index.html, so all page loads share one cache entry. */
async function networkFirst(request, key) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trimAssets(cache);
  }
  return response;
}

/** Old builds leave their assets behind; the oldest go first once there are too many. */
async function trimAssets(cache) {
  const assets = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith('/assets/'));
  for (const old of assets.slice(0, Math.max(0, assets.length - MAX_ASSETS))) await cache.delete(old);
}
