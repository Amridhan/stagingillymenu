## Goal

Update only the menu content inside `public/standalone.html` so it matches the Google Sheet "Full Menu for MOE" (164 items) and references the matching images from the Drive folder. No refactor, no JSON, no DB, no sync, no redesign, no admin/tracking changes.

## Blocker to resolve before I can edit

The Drive folder `11E_k5Gnl5cBDidh3qYXW_hOPSAx2ldaS` returns **404 / not found** for the connected Drive account (`aman@amridhan.com`). I cannot list or download the new images yet.

Pick one to unblock:
1. Share the folder with `aman@amridhan.com` (Viewer access), or
2. Re-share/move the folder under that account, or
3. Upload the image files directly into this chat — I'll drop them into `public/menu-images/`.

Once images are reachable, the rest of the plan runs without further questions.

## What I'll change (single file: `public/standalone.html`)

### 1. Section order (per your spec)

BEVERAGES, in this order:
```
ILLYCREMA — SIGNATURE
OHH MATCHA!
COLD SPECIALS
HOT SPECIALS
AROUND COFFEE
THE ESSENCE OF COFFEE
COLD BREW
COFFEES WITH MILK
TEA AND HERBAL INFUSIONS
HEALTHY SIPS
FROSTY REFRESHMENTS
SOFT DRINKS & WATER
SIGNATURE ARABIC COFFEE
```

FOOD, in this order:
```
ALL DAY BREAKFAST
SALADS & BOWLS
SANDWICHES & WRAPS
PASTAS & MAINS
CROISSANDWICHES
TARTINES & TOASTS
SIDES & BAKED DELIGHTS
DESSERTS
```

I'll reorder the existing `<section>` blocks to match. Existing CSS, lightbox JS, hover/scroll tracking, and the analytics script stay untouched.

### 2. Items (sheet is source of truth)

For every item in the sheet:
- Add a card if missing.
- Update name / description / price / variants if changed.
- Move to the correct subcategory if the sheet places it elsewhere.
- Remove cards that are not in the sheet.
- Order inside each subcategory follows the sheet's `#` column.

Card markup will reuse the existing card template already in the file (same classes, same `data-*` attributes used by the tracking handlers — I won't rename or remove any of them).

### 3. Image wiring

Goal: every card uses an `<img>` from `public/menu-images/`.

Steps:
1. Download every image from the Drive folder into `public/menu-images/`, preserving original filenames.
2. Build a normalized index: lowercase, strip punctuation, replace spaces with `_`, ignore extension.
3. For each sheet item, match its normalized item name against the index.
4. If matched → set `src="menu-images/<filename>"` and `alt="<Item Name>"`.
5. If unmatched → leave the card without an image (or keep the existing image if the same item already had one), and list it in the report.

Existing local files in `public/menu-images/` are kept; new files are added; nothing is deleted unless you ask later.

### 4. Strictly out of scope (will not touch)

- The analytics `<script>` block and any tracking attributes
- Lightbox markup/CSS/JS
- Hover and scroll tracking handlers
- `/open-menu`, admin, Supabase schema, RLS, edge functions
- Visual design, colors, fonts, spacing
- No JSON extraction, no Sheet sync, no menu DB, no versioning

## Report I'll produce after the edit

1. # of items updated, added, removed
2. Sheet image identifiers with no matching file
3. Files in `public/menu-images/` left unused
4. Confirmation: analytics script unchanged
5. Confirmation: `/open-menu` still loads the iframe
6. Confirmation: lightboxes still work
7. Confirmation: tracking still fires (same `data-*`/event names)
8. List of files changed (expected: `public/standalone.html` + new files in `public/menu-images/`)

## Technical notes

- Sheet read via the `google_sheets` connector gateway (already linked, 164 rows confirmed).
- Drive read via the `google_drive` connector gateway (linked, but folder currently 404 — needs the share fix above).
- All edits done with `code--apply_patch` on `public/standalone.html`. Image downloads via `curl` against `https://connector-gateway.lovable.dev/google_drive/drive/v3/files/{id}?alt=media` into `public/menu-images/`.
