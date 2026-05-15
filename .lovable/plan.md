## Password-protect /admin and admin APIs

Use a signed httpOnly cookie tied to `ADMIN_PASSWORD`. No DB changes, no Supabase Auth, no schema migration.

### New files

**`src/lib/admin-auth.ts`** — shared server helpers:
- `ADMIN_COOKIE = "illy_admin"`
- `getAdminPassword()` → reads `process.env.ADMIN_PASSWORD`; throws if missing
- `signToken(password)` → HMAC-SHA256 over a fixed payload (`"admin"`) using the password as key, returns hex
- `isAuthed(request)` → reads cookie via `getCookie`, recomputes expected token, `timingSafeEqual` compare
- `requireAdmin(request)` → returns `Response("Unauthorized", { status: 401 })` if not authed, else `null`
- If `ADMIN_PASSWORD` is unset, helpers fail closed (return 401 / never authenticate).

**`src/routes/api/admin/login.ts`** — POST handler:
- Reads `{ password }` from body
- Compares with `timingSafeEqual` against `ADMIN_PASSWORD`
- On success: `setCookie(ADMIN_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60*60*24*7 })` and returns `{ ok: true }`
- On failure: 401
- If `ADMIN_PASSWORD` missing: 503 `{ error: "Admin not configured" }`

**`src/routes/api/admin/logout.ts`** — POST handler: `deleteCookie(ADMIN_COOKIE)`, returns `{ ok: true }`.

### Changed files

**`src/routes/api/admin/stats.ts`** — at top of POST handler, call `requireAdmin(request)`; if it returns a Response, return it. No other logic changes.

**`src/routes/api/admin/device.ts`** — same `requireAdmin(request)` gate at top of POST handler.

**`src/routes/admin.tsx`** — add a small client-side gate:
- New `useState` for `authed` (default `false`) and `checking` (default `true`).
- On mount, do a lightweight probe: `fetch("/api/admin/stats", { method: "POST", body: "{}" })`; if 401 → show `<LoginForm />`, else mark authed and run existing `load()`.
- `LoginForm` posts to `/api/admin/login`; on success sets `authed=true` and calls `load()`.
- Existing analytics UI renders only when `authed`. No changes to analytics rendering or queries.

### Untouched
- `src/routes/api/public/track.ts` — public, unchanged.
- `src/routes/open-menu.tsx`, `src/routes/index.tsx` — public, unchanged.
- `public/standalone.html` — unchanged.
- Supabase schema — unchanged.

### Security notes
- Cookie is httpOnly + secure + SameSite=Lax, path `/`, 7-day expiry.
- Token = HMAC(password, "admin"); since the secret never leaves the server, the cookie cannot be forged without `ADMIN_PASSWORD`.
- All comparisons use `crypto.timingSafeEqual`.
- If `ADMIN_PASSWORD` is unset, every admin endpoint returns 401/503; no admin data is exposed.