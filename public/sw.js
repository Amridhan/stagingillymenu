/* illy menu service worker — full offline cache for the kiosk page.
 *
 * Caches:
 *   - SHELL: /standalone.html (the kiosk page itself) + root navigation
 *   - IMG:   /menu-images/* (product photos)
 *   - FONT:  fonts.googleapis.com stylesheet + fonts.gstatic.com font files
 *
 * Strategy:
 *   - Navigations / standalone.html  -> NetworkFirst, fallback to cached HTML
 *   - /menu-images/*                 -> CacheFirst + background revalidate
 *   - Google Fonts                   -> StaleWhileRevalidate
 *   - Page can post {type:'PRECACHE', urls:[...]} to warm the image cache
 *
 * Goal: after one online load, the kiosk works fully offline indefinitely.
 *
 * IMPORTANT: bump VERSION on every menu/image/content change so kiosks pick
 * up the new assets — otherwise they keep serving the old cached version.
 */
const VERSION = 'v9';
const SHELL_CACHE = 'illy-shell-' + VERSION;
const IMG_CACHE = 'illy-menu-images-' + VERSION;
const FONT_CACHE = 'illy-fonts-' + VERSION;

const SHELL_URLS = [
  '/standalone.html',
  'https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600;700;800&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Use no-cors for cross-origin Google Fonts so we still get an opaque
    // response into the cache when the strict CORS preflight isn't set.
    // Track whether the critical shell (the HTML page itself) actually made
    // it into the cache. If it didn't (e.g. offline install on first boot),
    // do NOT call skipWaiting — let the previous SW (if any) keep serving.
    // Activating an empty SW makes the next navigation render the 503
    // "Offline and no cached menu available." fallback, which is the most
    // common white-screen path on kiosks.
    let shellCached = false;
    await Promise.all(SHELL_URLS.map(async (url) => {
      try {
        const req = new Request(url, { cache: 'reload' });
        const resp = await fetch(req);
        if (resp && (resp.ok || resp.type === 'opaque')) {
          await cache.put(req, resp.clone());
          if (url === '/standalone.html') shellCached = true;
        }
      } catch (e) { /* offline at install — will retry on next online fetch */ }
    }));
    // First-ever install (no prior SW) is an exception: there's nothing to
    // fall back to, so activate anyway. Existing controller -> require a
    // good shell before swapping.
    if (shellCached || !self.registration.active) {
      self.skipWaiting();
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const keep = new Set([SHELL_CACHE, IMG_CACHE, FONT_CACHE]);
    await Promise.all(
      keys.filter((k) => /^illy-(shell|menu-images|fonts)-/.test(k) && !keep.has(k))
          .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

function isSameOrigin(url) {
  try { return new URL(url).origin === self.location.origin; }
  catch (e) { return false; }
}
function isMenuImage(url) {
  try {
    const u = new URL(url);
    return u.origin === self.location.origin && u.pathname.startsWith('/menu-images/');
  } catch (e) { return false; }
}
function isGoogleFont(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
  } catch (e) { return false; }
}
function isCacheableImage(resp) {
  if (!resp || !resp.ok || resp.status !== 200) return false;
  const ct = resp.headers.get('content-type') || '';
  return ct.indexOf('image/') === 0;
}
function isShellRequest(req) {
  if (req.mode === 'navigate') return true;
  if (!isSameOrigin(req.url)) return false;
  const p = new URL(req.url).pathname;
  return p === '/' || p === '/standalone.html' || p === '/standalone';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // 1. App shell / navigations -> NetworkFirst, cache fallback.
  if (isShellRequest(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const fresh = await fetch(req, { cache: 'no-cache' });
        if (fresh && fresh.ok) {
          // Always store under /standalone.html so root + standalone share the entry.
          cache.put('/standalone.html', fresh.clone());
          return fresh;
        }
        throw new Error('non-ok shell response');
      } catch (e) {
        const cached = await cache.match('/standalone.html')
                    || await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        return new Response('Offline and no cached menu available.', {
          status: 503, headers: { 'Content-Type': 'text/plain' },
        });
      }
    })());
    return;
  }

  // 2. Menu images -> CacheFirst + background revalidate.
  if (isMenuImage(req.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) {
        event.waitUntil((async () => {
          try {
            const fresh = await fetch(req, { cache: 'no-cache' });
            if (isCacheableImage(fresh)) cache.put(req, fresh.clone());
          } catch (e) { /* offline ok */ }
        })());
        return cached;
      }
      try {
        const fresh = await fetch(req, { cache: 'reload' });
        if (isCacheableImage(fresh)) cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // 3. Google Fonts -> StaleWhileRevalidate.
  if (isGoogleFont(req.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req).then((resp) => {
        if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
        return resp;
      }).catch(() => null);
      return cached || (await network) || new Response('', { status: 504 });
    })());
    return;
  }

  // 4. Other same-origin GETs (JS, CSS, favicons): NetworkFirst with cache fallback,
  //    stored in SHELL_CACHE so the page boots offline.
  if (isSameOrigin(req.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // Everything else (including POST /api/public/track) passes through untouched.
});

// Page-driven precache: standalone.html posts the full list of menu image URLs
// once registered, so every product photo lands in cache during the first
// online session — not lazily as the user scrolls.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'PRECACHE' || !Array.isArray(data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(IMG_CACHE);
    // Modest concurrency so we don't thrash the kiosk's network.
    const queue = data.urls.slice();
    const workers = Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const url = queue.shift();
        try {
          const match = await cache.match(url, { ignoreSearch: true });
          if (match) continue;
          const resp = await fetch(url, { cache: 'reload' });
          if (isCacheableImage(resp)) await cache.put(url, resp.clone());
        } catch (e) { /* skip */ }
      }
    });
    await Promise.all(workers);
  })());
});
