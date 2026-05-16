## Menu edits in `public/standalone.html`

All changes are copy/price/variant tweaks plus one image swap. No logic, styling, or other items touched.

### 1. Fiocco (HOT SPECIALS, lightbox id 19)
- **Grid card** (line ~1788): change displayed price `24` → `26`.
- **Lightbox data** (lines 6174–6184): set `price: "26"`, and remove the `{ name: "Large", price: "26" }` variant. Keep the soy/almond/oat/lactose-free (+6) and extra-shot (+4) variants.

### 2. Marocchino caldo (HOT SPECIALS, lightbox id 20)
- **Grid card**: no change (stays AED 21).
- **Lightbox data** (lines 6186–6195): replace the `Regular`/`Large` variants with:
  - `{ name: "Available with soy, almond, oat drink and lactose free", price: "6" }`
  - `{ name: "Add extra shot espresso", price: "4" }`

### 3. Cappuccino freddo (COLD SPECIALS, lightbox id 13)
- **Grid card** (line ~1618): `24` → `26`.
- **Lightbox data** (lines 6110–6118): `price: "24"` → `"26"`. Variants unchanged.

### 4. Cappuccino greco (COLD SPECIALS, lightbox id 14)
- **Grid card** (line ~1645): `24` → `26`.
- **Lightbox data** (lines 6120–6129): `price: "24"` → `"26"`. Variants unchanged.

### 5. Espresso tiramisu (COLD SPECIALS, lightbox id 17)
- **Grid card** is already `32` — no change.
- **Lightbox data** (lines 6151–6159): `price: "28"` → `"32"`. Variants unchanged.

### 6. Strawberry Bake Cheesecake (DESSERTS, lightbox id 155) — image
- Download the cheesecake image from the Google Drive folder via the linked **Illy Caffe Menu Images** connector, save it as `public/menu-images/Strawberry_Bake_Cheesecake.webp` (converting/optimizing if the source is jpg/png).
- **Grid card** (line ~5598): replace `<img src="" alt="Strawberry Bake Cheesecake" loading="eager" …>` with the standard lazy pattern used by other dessert cards: `<img data-menu-img="1" data-src="menu-images/Strawberry_Bake_Cheesecake.webp" decoding="async" alt="Strawberry Bake Cheesecake" />`. Remove the inline `onerror` SVG fallback.
- **Lightbox data** (line 7387): `img: ""` → `"menu-images/Strawberry_Bake_Cheesecake.webp"`.

### 7. Eggs Benedict (ALL DAY BREAKFAST, lightbox id 81) — price not showing
- Root cause: lightbox renders the variants list when present. The placeholder variant `{ name: "-", price: "" }` (lines 6769–6771) suppresses the base price display.
- Fix: change `variants: [ { name: "-", price: "" } ]` to `variants: []`. Price `47` already correct.

### 8. Oats Porridge (ALL DAY BREAKFAST, lightbox id 82) — price not showing
- Same fix as Eggs Benedict. Lines 6779–6781: change to `variants: []`. Price `49` already correct.

## Files touched
- `public/standalone.html` — ~10 small edits.
- `public/menu-images/Strawberry_Bake_Cheesecake.webp` — new file from Drive.

## Out of scope
- No changes to other menu items, loader code, lightbox renderer, service worker, routes, or styling.
- I will NOT publish; awaiting your "publish" command after verification.

## Verification (after approval & edit)
1. Reload `/` → grid cards show: Fiocco 26, Cappuccino freddo 26, Cappuccino greco 26, Espresso tiramisu 32 (unchanged), Strawberry Cheesecake image renders.
2. Open each lightbox: Fiocco shows base 26 + milk/extra-shot only (no Large); Marocchino caldo shows base 21 + the two new variants; Cappuccino freddo/greco show 26; Espresso tiramisu shows 32; Eggs Benedict shows 47; Oats Porridge shows 49.

## Open question
The Drive folder may contain multiple shots. I'll pick the most product-shot-style file; if you have a specific filename you want, tell me before I apply.