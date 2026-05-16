## Goal

Add the 4 new items (Mediterranean Halloumi Bruschetta, Nutty Berry Toast, The Lost Bread, Ultimate Avocado Toast) to `public/standalone.html` by re-syncing from the Google Sheet (source of truth) and the Drive image folder. No refactor, no schema changes, no admin/tracking changes.

## Steps

1. **Re-read the Sheet** ("Full Menu for MOE", now 168 rows) via the `google_sheets` connector. Snapshot the 4 new rows: category, subcategory, name, description, price, image filename, order `#`.

2. **Re-scan the Drive folder** via the `google_drive` connector. Diff against `public/menu-images/` and download only the new files (the 4 new item images plus any I missed). Preserve original filenames.

3. **Match images** using the existing normalization rules (lowercase, strip punctuation/accents, `illycrema → illy_crema`, etc.). Report any of the 4 that don't resolve to a file.

4. **Insert 4 cards** into `public/standalone.html` using the existing card template (same classes, same `data-*` attributes used by tracking). Place each in the subcategory and position the Sheet specifies. No reordering of existing cards unless the Sheet's `#` column moved them.

5. **Report**:
   - 4 rows added (name + subcategory + image filename + matched/placeholder)
   - Any new files added to `public/menu-images/`
   - Confirmation: analytics script untouched
   - Confirmation: lightbox + tracking still wired (same `data-*`)
   - Confirmation: `/open-menu` still loads
   - Files changed (expected: `public/standalone.html` + new files in `public/menu-images/`)

## Strictly out of scope

- Existing 164 cards (no re-edits, no re-ordering unless Sheet `#` changed)
- Analytics `<script>`, lightbox JS/CSS, tracking handlers
- `/open-menu`, admin, Supabase, RLS, edge functions
- Casing/text drift cleanup beyond the 4 new rows
- Pruning unused images in `public/menu-images/`

## Confirm before I start

- Sheet ID is still the same "Full Menu for MOE" sheet I synced last time — correct?
- Drive folder is still `11E_k5Gnl5cBDidh3qYXW_hOPSAx2ldaS` — correct?
