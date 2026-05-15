## Add hidden 5-tap Device Code reveal to /open-menu

Single-file change to `src/routes/open-menu.tsx`. No other files touched.

### Changes to `src/routes/open-menu.tsx`

Keep all existing logic (device id read/create, `?pair=1` chip). Add:

1. **Invisible tap zone** — a `<div>` rendered as a sibling of the iframe and chip:
   - Fixed position, `top: 0; right: 0; width: 48px; height: 48px`
   - `background: transparent`, no border, no visible content
   - `z-index: 2147483646` (just under the chip, above the iframe)
   - `cursor: default`
   - Only an `onClick`/`onTouchStart` handler — does not block menu touches anywhere else

2. **Tap counter logic** (in the existing `useEffect` or a small handler):
   - Maintain a ref `tapsRef` holding `number[]` of recent tap timestamps
   - On each tap: push `Date.now()`, drop entries older than 5000ms
   - If length ≥ 5 → reveal the chip and clear the array

3. **Reveal state**:
   - Reuse the existing `pairCode` state. Add a second state `revealed` (boolean) that drives the chip visibility independently from `?pair=1`
   - Compute the code once on mount from the device id (8 chars, dashes stripped, uppercased) — same format already used for `?pair=1`
   - If `?pair=1`: set `revealed = true` immediately (no auto-hide, matches current behavior)
   - On 5-tap: set `revealed = true` and start a 120,000ms `setTimeout` to set it back to `false`. Clear any prior timeout if re-triggered.

4. **Chip rendering**: render the existing chip when `revealed === true`. Same styling as today (`Device Code: XXXXXXXX`, bottom-right, monospace, `pointer-events: none`).

### Untouched
- `public/standalone.html`, `/api/public/track`, tracking event names
- Supabase schema, admin dashboard, admin auth
- `/`, menu data, menu design
- Device id storage keys (`aycilly.analytics.device.v1`, `aycilly_analytics_device`) and the read-or-create flow

### Behavior summary
- `/open-menu` (no query): chip hidden. 5 taps in top-right 48×48 within 5s → chip shows for 120s then hides.
- `/open-menu?pair=1`: chip shows immediately and persists (unchanged).
- Tracking: iframe still posts to `/api/public/track` with the same `device_id`. The new tap zone only handles clicks in the 48×48 top-right corner; the rest of the iframe is fully interactive.
