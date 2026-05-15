## Add /open-menu route

Create a new TanStack route file `src/routes/open-menu.tsx` that mirrors `src/routes/index.tsx`.

### What will be built
- New route file `src/routes/open-menu.tsx` with the same iframe-based rendering of `/standalone.html` as the existing `/` route.
- Same meta tags (title "illy Caffè — Menu", description "illy Caffè interactive menu.").
- Same full-viewport iframe styling.

### What will NOT change
- `public/standalone.html` — untouched.
- `src/routes/index.tsx` — `/` continues to work exactly as before.
- Admin, tracking, Supabase schema, or any other files.

### Expected outcome
- `/open-menu` renders the identical menu via iframe.
- `/` remains unchanged and functional.
- No new API calls, logic, or UI changes introduced.