## Problem

Tapping the "illy Caffè | Mall of the Emirates" header 5 times is supposed to reveal the device code, but nothing happens.

Root cause: the tap handler lives in `src/routes/open-menu.tsx` as a transparent `<div>` overlay positioned at hard-coded coordinates (`top: 24, left: 320, 320×44`) on top of the iframe. Two problems with that:

1. The user is currently on `/` (which renders `src/routes/index.tsx`). That route embeds the same iframe but has **no overlay at all** — so taps on the header do nothing.
2. Even on `/open-menu`, the overlay is at fixed pixel coordinates that don't actually sit on top of the "Mall of the Emirates" text at every viewport (especially on the in-app preview at 1116×743 and on portrait tablets).

The header element itself (`<div class="logo-txt">…Mall of the Emirates</div>`) lives inside `public/standalone.html`, and that file already manages the same device ID via `localStorage` key `aycilly.analytics.device.v1` and cookie `aycilly_analytics_device` (lines ~7806–7838). So the reveal logic belongs there.

## Fix

Attach the 5-tap reveal directly to the `.logo-txt` element inside `public/standalone.html`:

1. Give the existing `<div class="logo-txt">` an `id="logoTxt"` and `style="cursor:default; user-select:none;"` so it stays visually unchanged.
2. In the existing inline analytics script (right after `deviceId` is resolved around line 7838), add a small handler:
   - Listen for `click` on `#logoTxt`.
   - Track timestamps in a local array; keep only those within the last 5 seconds.
   - On the 5th tap, render a fixed-position pill in the bottom-right of the iframe (`position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; background: rgba(0,0,0,.75); color:#fff; font: 600 13px/1.2 ui-monospace, Menlo, monospace; padding: 8px 12px; border-radius: 8px;`) showing `Device Code: <8-char uppercase from deviceId>`.
   - Auto-hide after 120 seconds, or on next tap outside the pill.
3. Remove the now-redundant transparent overlay + tap handler block from `src/routes/open-menu.tsx` (the `handleHiddenTap`, the floating `<div onClick onTouchStart>`, and the `pairCode/revealed` state/UI). Keep the `?pair=1` deep-link working by forwarding it: if the URL contains `?pair=1`, change the iframe src to `/standalone.html?pair=1`, and in standalone.html auto-show the pill when `location.search` contains `pair=1`.
4. No styling changes to the header itself — the text remains exactly as it appears today.

## Why this is better

- Works on both `/` and `/open-menu` without duplicating logic.
- The tap target is the real element, so it works at any viewport and on touch devices.
- No cross-frame coordination needed — the device ID source of truth (the same localStorage/cookie keys) already lives inside standalone.html.

## Files touched

- `public/standalone.html` — add `id` to header text + ~30 lines of inline JS for tap counter and pill.
- `src/routes/open-menu.tsx` — remove dead overlay code; preserve `?pair=1` passthrough on the iframe src.

## Out of scope

- No change to image loading, service worker, or any menu content.
- No change to how device IDs are generated or persisted.
