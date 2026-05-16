# Image loading — root cause and fix

## What's actually broken

Live site `illyremixmenu.lovable.app` serves `standalone.html` correctly (200), but image requests like `/menu-images/Illycrema%20Classic.webp` return **404** on production. Locally and in dev they work, which is why this wasn't caught.

Proof:
- `/menu-images/Affogato_With_Illy_Coffee.webp` → **200 OK** (underscores)
- `/menu-images/Affogato%20Matcha.webp` → **404** (space)
- `/menu-images/Illycrema%20Classic.webp` → **404** (space)
- `/standalone.html`, `/_headers`, `/preview-popups.html` → all 200

So the published Cloudflare Worker asset layer is dropping (or failing to URL-decode) every file whose name contains a space. Of the 212 files in `public/menu-images/`, **158 have spaces** in their name → 158 broken images, exactly matching the placeholder gaps in your screenshots.

All previous "image" fixes (eager loading, preload, prefetch, cache headers) were correct but irrelevant — the files simply aren't on the server.

## Fix

### 1. Rename every file in `public/menu-images/` to remove spaces

Replace each space with `_`. Also flatten any double-encoded artifacts. Example: `Illycrema Classic.webp` → `Illycrema_Classic.webp`, `Turkey & Cheese Toast.webp` → `Turkey_&_Cheese_Toast.webp` (or `Turkey_and_Cheese_Toast.webp` to also drop the `&`, which can hit similar encoding bugs).

Recommended rule: `[^A-Za-z0-9._-]+` → `_`. This kills spaces, `&`, parens, commas in one pass and guarantees URL-safety on every CDN forever.

### 2. Update `public/standalone.html`

Rewrite every `menu-images/...` reference (in `<link rel="preload">`, `<img src>`, `alt`, card names if used as keys, and the JS `ITEMS` array `img:` fields) to point at the renamed files. Do it with a single sweep so HTML and JS stay in sync.

### 3. Re-publish

Frontend assets only go live after Publish → Update.

### 4. Verify

After publish:
- `curl -sI https://illyremixmenu.lovable.app/menu-images/Illycrema_Classic.webp` → expect 200
- Reload the live page, confirm placeholders are gone across all sections.

## Out of scope

No changes to React routes, admin login, analytics, lightbox, ITEMS data structure beyond the image-path field, or the previous performance/caching work — all of that stays.

## Open question

Should renamed filenames use `_` (preserves readability: `Illycrema_Classic.webp`) or `-` (more common web convention: `illycrema-classic.webp`, lowercased)? I'll default to `_` with original casing unless you prefer the lowercase-dash style.
