## Findings

### Images
I audited every `<img src="menu-images/...">` and every `ITEMS[].img` entry in `public/standalone.html` against the 212 files in `public/menu-images/`.

- **166 unique image refs**, **165 resolve correctly**, **1 is genuinely broken**:
  - `Turkey & Cheese Toast` → HTML has `menu-images/Turkey%20%26amp%3B%20Cheese%20Toast.webp` (double-encoded `&` → `%26amp%3B`). Browser requests `Turkey &amp; Cheese Toast.webp` which doesn't exist.
- **Total payload**: ~0.9 MB across all 165 images (avg ~5.5 KB, max 26 KB). The set is tiny — there's no bandwidth reason for "a lot" of images to lag.

So the perceived "a lot of images not loading" is almost certainly **lazy-loading behavior + no caching headers + no decoding hint**, not missing files. Every `<img>` uses `loading="lazy"` with no `decoding`, no `fetchpriority`, and no `onerror`. On a long single-page menu, off-screen images don't start fetching until you scroll near them, and revisits re-fetch unless the browser caches them (no `Cache-Control` is set on `/menu-images/*`).

### Admin password
I can't read secret values back. The `ADMIN_PASSWORD` secret in Lovable Cloud is set, but its value is write-only from my side. The login route (`src/routes/api/admin/login.ts`) compares the submitted value against `process.env.ADMIN_PASSWORD` via `safeEqualString`. If the saved value was set incorrectly (trailing newline, quotes, accidental space), every attempt returns 401 "Invalid password". The fix is to **reset the secret to a known value**.

---

## Plan

### 1. Fix the one broken filename reference
Edit `public/standalone.html`: replace `Turkey%20%26amp%3B%20Cheese%20Toast.webp` (in `<img src>`, `alt`, card name, and the JS `ITEMS` entry) with `Turkey%20%26%20Cheese%20Toast.webp`. No other text changes.

### 2. Make image loading instant, permanent, consistent
All in `public/standalone.html` (single-file scope, no refactor):

a. **Eager-load all menu images** — change every `loading="lazy"` to `loading="eager"` and add `decoding="async"` + `fetchpriority="low"` (so they don't block layout but all start fetching as soon as the doc parses). At ~0.9 MB total, eager is faster than scroll-triggered lazy.

b. **Add `onerror` fallback** to every `<img>` — swap to a tiny inline SVG placeholder so a single bad file never leaves a broken icon. Tagged with `data-img-fallback` so it's easy to spot in QA.

c. **Preload the first 8 visible images** via `<link rel="preload" as="image">` in `<head>` so the top of the menu paints instantly on first load.

d. **Idle-time prefetch loop** — after `window.load`, walk `ITEMS` in a `requestIdleCallback` and prefetch any image not already cached. Guarantees that after a few seconds, every image is in the browser cache and remains instant on subsequent scroll/navigation.

### 3. Fortify with HTTP caching
Add a `public/_headers` file (Cloudflare/Lovable static-asset convention) so `/menu-images/*` is served with `Cache-Control: public, max-age=31536000, immutable`. Once cached, the browser never re-requests during the year.

### 4. Reset the admin password
I'll call `add_secret` for `ADMIN_PASSWORD` so you can enter a fresh value through the secure UI. Once you submit, the new value is live immediately and the login form will accept it. I will **not** echo or log the value anywhere.

---

## Out of scope
- No changes to the analytics script, lightbox JS/CSS, tracking handlers, ITEMS data shape, section order, or `/open-menu`.
- No image regeneration or compression (files are already tiny).
- No admin UI changes.

## After-edit verification
- Re-run the ref/file audit script → expect 0 broken refs.
- Open the preview, scroll fast through the menu, confirm no broken icons and that images appear immediately on first paint.
- Try the admin login with the new password.
