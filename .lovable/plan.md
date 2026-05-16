## Root causes

Both issues live in `public/standalone.html`'s `__ILLY_IMG_LOADER__` block (lines ~8296–8395).

### 1. Slow first-time images

Cards render `<img data-src="..." data-menu-img="1">` with **no `src`**. The loader only sets `src` when an IntersectionObserver fires (`rootMargin: 600px`). So:
- On first visit, each section's images only start downloading when the user scrolls within ~600px of it. Network + decode takes 1–3s → empty thumbnails on first click.
- The service worker caches what loaded, so on revisit those images appear instantly. That's why "Fiocco" and "Americano" feel reliable — their files are already in the SW cache (and a handful of cards at the top, like illycrema/Signature/Matcha, have a literal `src=` attribute so they load eagerly).

### 2. Lightbox image blank

In `oLb()` (line 7569) the lightbox builds a fresh `<img data-menu-img="1" data-src="...">` and calls `window.__illyLoadImg(img)`. That function (line 8385) does:

```js
if (img.getAttribute('src') && !img.getAttribute('data-src')) { ... }
if (img.complete && img.naturalWidth > 0) markLoaded(img);
else trackEager(img);     // ← only attaches listeners, never sets src
```

There is no branch that calls `loadOne(img)` when the img has `data-src` but no `src`. Result: the lightbox `<img>` never gets a `src` and renders blank. (It only "works" when the same URL happens to already be cached/decoded into another `<img>`, which is rare for a fresh element.)

## Fix

Edit only `public/standalone.html`.

### A. Fix the lightbox loader (one-line bug)

In `window.__illyLoadImg`, when the img has `data-src` and no `src`, call `loadOne(img)` directly:

```js
window.__illyLoadImg = function(img){
  if (!img) return;
  img.setAttribute('data-menu-img','1');
  if (img.getAttribute('src') && !img.getAttribute('data-src')) {
    img.setAttribute('data-src', img.getAttribute('src'));
  }
  if (img.complete && img.naturalWidth > 0) { markLoaded(img); return; }
  if (img.getAttribute('src')) { trackEager(img); return; }
  loadOne(img);   // ← NEW: actually start the download
};
```

This alone makes the lightbox always render.

### B. Preload every menu image on boot (so the first click is instant)

Replace the IntersectionObserver-gated lazy loader with an **eager, concurrency-capped preloader** that runs right after DOMContentLoaded:

- Collect all `img[data-menu-img="1"]` that have `data-src` but no `src`.
- Queue them through a worker pool of 6 parallel `loadOne` calls (browser still respects HTTP/2 multiplexing; we cap to keep main thread responsive and avoid bursty contention on the hidden-tap / nav scripts).
- Above-the-fold images that already have `src=` keep their current eager path (`trackEager`) — no change.
- The existing service worker (`/sw.js`) caches each 200 response, so subsequent sessions are instant from cache.
- Keep `window.__illyLoadImg` working as a fast path for the lightbox (fix A).
- Keep the "broken images" console diagnostic.

Total payload is ~150 small webp files; preloading them in the background completes within a few seconds on a normal connection and saturates the SW cache before the user finishes scrolling.

### C. Lightbox safety net

In `oLb()`, after constructing the lightbox `<img>`, if `__illyLoadImg` is missing (defensive), still call `loadOne` via a tiny inline fallback. Not strictly required after fix A, but cheap.

## Files touched

- `public/standalone.html` — replace the body of the `__ILLY_IMG_LOADER__` IIFE; ~25 lines changed. No HTML markup changes, no React/route changes, no SW changes.

## Out of scope

- No changes to `sw.js`, route files, `_headers`, or image assets themselves.
- No change to lightbox markup, analytics, or device-code reveal.

## Verification

1. Hard-reload the preview at `/` (DevTools → Disable cache → Reload).
2. Network tab: within ~3 seconds you should see every `/menu-images/*.webp` request fire, all 200s from network on first load.
3. Click any card immediately after the menu paints → lightbox image renders.
4. Reload again with cache enabled → all `/menu-images/*` come from the service worker (size column shows "(ServiceWorker)"), cards paint instantly.
