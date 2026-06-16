# Phase 2 — Kiosk freeze + cache hygiene

Same build/QC tango as Phase 1. All edits localised to `public/standalone.html` and `public/sw.js`. No core functionality changes — only interaction-state guards and cache housekeeping.

## On your cache question

Short answer: **yes, partially — but not in the "junk accumulating" sense people usually mean.** Walking through what actually lives on a kiosk:

- **Service Worker caches** (`illy-shell-v9`, `illy-menu-images-v9`, `illy-fonts-v9`) — these are *intentional* and the reason the kiosk works offline. They self-prune on every `VERSION` bump (the `activate` handler in `sw.js` already deletes any cache not in the keep-set). Not junk.
- **WebView HTTP cache** — small, the OS evicts it under memory pressure. Not a real concern.
- **IndexedDB** (analytics queue in `standalone.html`) — this is the one place actual buildup can happen. If the network is flaky for days, the offline event queue grows. Worth a bounded-size guard.
- **`localStorage`** — holds `illyReloads` (reload-cap array, max ~5 entries) and a couple of small keys. Negligible.

So "clear cache regularly" as a blanket policy would be **counter-productive** — it would force a full re-download of every menu image on the next boot, which is exactly the cold-start fragility we're trying to avoid. The right move is **targeted hygiene**: cap the analytics queue, and make sure SW version bumps continue to do the heavy lifting when menu content changes.

## Steps

### Step 1 — Animation-tied tap guard on cards
**File:** `public/standalone.html` — card click/touch handler that opens the lightbox.
**Change:** Set a `lightboxBusy` flag the moment a card tap fires. Clear it on the *lightbox's own `transitionend`/`animationend`* event (not a fixed timer). While the flag is set, ignore further card taps. No delay added for normal use; only blocks taps that arrive mid-open.
**Why safe for customers:** a single tap is never dropped. Only the 2nd/3rd tap in a 200–400ms burst is ignored, which is exactly what causes the wedge today.
**QC:** open card, single tap closes — still instant. Rapid 5-tap test — only one lightbox opens, no scroll-lock left behind.

### Step 2 — Scroll-lock watchdog
**File:** `public/standalone.html` — alongside the existing visibilitychange handler.
**Change:** Every 2s, if `document.body.style.overflow === 'hidden'` but no `.lightbox.open` (or equivalent) is in the DOM, clear the overflow. Pure safety net.
**Why safe for customers:** invisible when things work; rescues the page when they don't.
**QC:** force the mismatch in devtools (set `body.style.overflow='hidden'`), confirm it self-clears within ~2s.

### Step 3 — Defer new SW activation until idle
**File:** `public/sw.js` + small hook in `standalone.html`.
**Change:** Remove the unconditional `skipWaiting()` path; instead, when the page detects a waiting SW (`registration.waiting`), it posts `{type:'SKIP_WAITING'}` only after 30s of no interaction *and* no lightbox open. SW listens for that message and calls `skipWaiting()` then.
**Why safe for customers:** a new menu version still lands, just during a quiet moment instead of mid-tap. Worst case it lands on next cold boot — same as today.
**QC:** bump VERSION to v10, watch DevTools → Application → Service Workers; new SW stays "waiting" until idle window, then activates cleanly.

### Step 4 — Bound the analytics IndexedDB queue
**File:** `public/standalone.html` — analytics enqueue path.
**Change:** Cap the offline event store at e.g. 2000 rows. When over cap, drop oldest. Also drop any row older than 7 days on startup.
**Why safe for customers:** invisible. Just prevents IDB from growing unbounded on a kiosk that's offline for a week.
**QC:** seed 2500 fake rows in console, reload, confirm count returns to ≤2000 and oldest are gone.

### Step 5 — Confirm SW version-bump hygiene is the real cache-clear lever
**No code change.** Documentation note in `.lovable/plan.md`:
- Menu content / image changes → bump `VERSION` in `sw.js`. That's the cache-clear knob. Old caches are auto-deleted on activate.
- Do NOT instruct staff to "clear cache" on the device — it defeats offline mode.

## Phase 2 status: IMPLEMENTED
- Step 1 ✅ Animation-tied tap guard (`__lbBusy` flag, cleared on `.lb-panel` animationend, 400ms safety timeout, cleared on close).
- Step 2 ✅ Scroll-lock watchdog (2s interval; releases stuck `body.overflow:hidden` when no lightbox is open).
- Step 3 ✅ Idle-only SW activation. `sw.js` bumped to v10; install no longer calls `skipWaiting()` when a controller exists. Page posts `SKIP_WAITING` only after 30s of no interaction AND no open lightbox; controllerchange triggers a one-shot reload.
- Step 4 ✅ Bounded IDB analytics queue (2000-row cap with oldest-first eviction; 7-day age sweep on db open).
- Step 5 ✅ Cache policy documented above. Staff should NOT clear app cache — version bumps are the correct lever.

### QC checklist for the device
1. Tap a card rapidly 5×: only one popup opens, page remains scrollable after close.
2. Force `document.body.style.overflow='hidden'` in devtools without opening a popup → clears within ~2s.
3. Bump `VERSION` to v11 later → new SW stays "waiting" until 30s idle, then activates and reloads once.
4. In devtools: `indexedDB.open('aycilly.analytics.queue.v1')` → events store stays ≤ 2000 rows.

## Out of scope (deliberately)
- Brand splash screen (would mask the real issue, not fix it).
- Generic global tap debounce (would make single taps feel laggy).
- Forcing SW updates immediately (causes the mid-session blank you've seen).

## Rollback
Each step is one localised edit; revert by undoing that hunk. Step 3 also requires reverting the SW message handler.

Approve to start with Step 1.
