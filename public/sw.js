/* illy menu service worker — cache-first for /menu-images/* */
const VERSION = 'v3';
const IMG_CACHE = 'illy-menu-images-' + VERSION;
const PRECACHE = ["/menu-images/illycrema_Classic_Small.webp", "/menu-images/illycrema_Trio.webp", "/menu-images/illycrema_Nuvola.webp", "/menu-images/Signature_Strawberry_Matcha.webp", "/menu-images/Signature_Blueberry_Matcha.webp", "/menu-images/Cloud_Matcha_Coconut_Water.webp", "/menu-images/Cloud_Matcha_Coconut_Milk.webp", "/menu-images/Matcha_Passion_Lemonade.webp"];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const c = await caches.open(IMG_CACHE);
      await Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    } catch (e) { /* noop */ }
    self.skipWaiting();
  })());
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!isMenuImage(req.url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(IMG_CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) {
      // Revalidate in background; never block paint
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req, { cache: 'no-cache' });
          if (fresh && fresh.ok) cache.put(req, fresh.clone());
        } catch (e) { /* offline ok */ }
      })());
      return cached;
    }
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      // Last resort: 1x1 transparent gif so onerror handler runs
      return new Response(
        Uint8Array.from(atob('R0lGODlhAQABAAAAACw='), c => c.charCodeAt(0)),
        { status: 504, headers: { 'Content-Type': 'image/gif' } }
      );
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PRECACHE' && Array.isArray(event.data.urls)) {
    event.waitUntil((async () => {
      const cache = await caches.open(IMG_CACHE);
      await Promise.allSettled(
        event.data.urls.map((u) => cache.match(u).then((hit) => hit ? null : cache.add(new Request(u, { cache: 'reload' }))))
      );
    })());
  }
});
