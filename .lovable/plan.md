## Scope (revised — minimal, low-risk)

Three changes only. No backend changes. No new dependencies. No touching React/SSR/admin/auth/tracking.

### 1. Switch OptiSigns devices to `/standalone.html`

Config change on OptiSigns side (no code). New URL per device:
`https://stagingillymenu.lovable.app/standalone.html`

Removes the React + SSR + iframe layers, which are the most likely cause of "worked once then blank" on Android 11 WebView.

### 2. Bump SW cache version to `v8`

One-line change in `public/sw.js`. Required so today's price/description/image edits propagate to devices already online.

### 3. Add a self-healing layer to `public/standalone.html`

Three tiny guards, all in the kiosk page itself, ~30 lines total:

- **Boot watchdog**: if no menu tiles have rendered within 10 seconds of page load, `location.reload()`. Capped at 2 reloads per hour via `localStorage` so a genuinely broken deploy can't loop.
- **Global error trap**: `window.onerror` + `unhandledrejection` → schedule a reload after 5 seconds. Catches a single bad chunk crashing the page.
- **Daily refresh at 09:00 local time**: once-per-day reload, gated so it only fires in a narrow window (09:00–09:05) and only once per day via `localStorage` flag. Standard kiosk hygiene — picks up new SW + clears any WebView leak. Skipped on devices that just booted within the same window.

## Files touched

- `public/sw.js` — `VERSION = 'v7'` → `'v8'`. Nothing else.
- `public/standalone.html` — add one `<script>` block at the end with the three guards above.

## Risk & rollback

| Change | Risk | Rollback |
|---|---|---|
| OptiSigns URL → `/standalone.html` | None — config only | Change URL back |
| `VERSION` v7 → v8 | None — intended use of the version | Bump again |
| Watchdog + error trap + 09:00 refresh | Low — worst case a working page reloads once invisibly; caps prevent loops | Delete the script block |

## What I'm explicitly NOT doing

- Per-image retry / placeholder
- Hidden diagnostics pill
- Boot beacon to `/api/public/track`
- SW kill switch / stale-cache eviction
- Redirect at `/`
- Anything in `src/routes/`, backend, or SW beyond the version bump

If issues persist after 48h of monitoring, we revisit with real device data.

## After this ships

1. Update OptiSigns URL on every device to `/standalone.html`.
2. Going forward: every menu edit → bump `VERSION` in `sw.js` (I'll leave a comment reminder above the constant).