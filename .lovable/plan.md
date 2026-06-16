# Standalone Kiosk — Phase 1 fixes, build + QC tango

Execution model: implement one step at a time, verify, then move on. **No core functionality changes** — only safety, scroll, and white-screen guards. All edits localised to `public/standalone.html` and `public/sw.js`.

For each step:
1. Make the edit.
2. Re-read the affected region to confirm.
3. QC: load `/standalone.html` in the preview, check console for errors, verify scroll + render still work.
4. Report pass/fail before moving to the next step.

## Steps

### Step 1 — Release scroll lock on visibility change (fixes stuck-scroll)
**File:** `standalone.html` ~7701–7706 (visibilitychange handler).
**Change:** Before `resetToTop()`, call `cLb()` (close lightbox if open) and force `document.body.style.overflow = ''`. Idempotent — no-op when lightbox isn't open.
**QC:** Open a card popup, switch tab/back, confirm popup closes and page scrolls.

### Step 2 — Deduplicate event listeners
**File:** `standalone.html` ~7686–7729.
**Change:** Remove the duplicate `visibilitychange` block and duplicate touch/mousedown block. Keep one of each.
**QC:** Confirm scroll-idle reset still works once (not twice). No console errors.

### Step 3 — Fix `touch-action` blocking horizontal nav swipe
**File:** `standalone.html` lines 83–86.
**Change:** Replace `touch-action: pan-y` on `html, body` with `touch-action: manipulation`. The horizontal `.mnav`/`.snav` rails will then accept pan-x. Vertical body scroll unaffected.
**QC:** Swipe nav tabs horizontally on a narrow viewport; vertical scroll still smooth.

### Step 4 — Non-blocking Google Fonts (white-screen on offline boot)
**File:** `standalone.html` lines 15–18.
**Change:** Convert the stylesheet `<link>` to `rel="preload" as="style" onload="this.rel='stylesheet'"` with a `<noscript>` fallback. Local `@font-face` fallback already in place.
**QC:** Preview renders normally; throttle to offline in browser tools → page still paints (uses local fonts).

### Step 5 — Tame the unhandledrejection auto-reload
**File:** `standalone.html` ~8475–8500.
**Change:**
- In the `unhandledrejection` handler, ignore network errors (`TypeError`, `AbortError`, anything matching `/fetch|network|load failed/i`) — these are normal offline noise, not real crashes.
- Add a shared `reloadScheduled` flag so the boot watchdog and the error trap can't both schedule a reload (fixes credit double-burn).
- Wrap the analytics IDB open in a `.catch` so a corrupt store can't bubble up.
**QC:** Console should show no spurious reload scheduling when the network is offline.

### Step 6 — Service worker: only `skipWaiting` after precache succeeds
**File:** `sw.js` install handler + bump `VERSION` to `v9`.
**Change:** Move `self.skipWaiting()` inside the precache `.then()`. If precache fails, the old SW keeps serving instead of activating an empty one.
**QC:** Bump version, confirm preview loads, DevTools → Application → Service Worker shows v9 active and precache populated.

## Out of scope for Phase 1
Phase 2 cleanup (fetchpriority pruning, `.popup-overlay` consolidation, IDLE_MS rename, IO disconnect, SW `Request`-keyed cache) is deferred until Phase 1 is stable in the field.

## Rollback
Each step is one localised edit; revert by undoing that single hunk. `VERSION` bump in `sw.js` is the only client-cache-affecting change.

Approve to start with Step 1.