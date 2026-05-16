/* illy menu service worker — safe cache for /menu-images/*
 * Rules:
 *  - Only intercept GET /menu-images/*
 *  - Cache-first when a 200 is cached; revalidate in background
 *  - On cold miss, fetch from network and only cache 200 image/* responses
 *  - On network failure, DO NOT synthesize a response — let the browser
 *    surface a real error so the page's loader can retry cleanly.
 */
const VERSION = 'v6';
const IMG_CACHE = 'illy-menu-images-' + VERSION;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('illy-menu-images-') && k !== IMG_CACHE)
          .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

function isMenuImage(url) {
  try {
    const u = new URL(url);
    return u.origin === self.location.origin && u.pathname.startsWith('/menu-images/');
  } catch (e) { return false; }
}

function isCacheable(resp) {
  if (!resp || !resp.ok || resp.status !== 200) return false;
  const ct = resp.headers.get('content-type') || '';
  return ct.indexOf('image/') === 0;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!isMenuImage(req.url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(IMG_CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) {
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req, { cache: 'no-cache' });
          if (isCacheable(fresh)) cache.put(req, fresh.clone());
        } catch (e) { /* offline ok */ }
      })());
      return cached;
    }
    // No cache: pass through to the network. Only cache real 200 image/* responses.
    // Use cache:'reload' to bypass any poisoned browser HTTP cache entry
    // (e.g. an early 0-byte/error response pinned by immutable max-age).
    const fresh = await fetch(req, { cache: 'reload' });
    if (isCacheable(fresh)) cache.put(req, fresh.clone());
    return fresh;
  })());
});
