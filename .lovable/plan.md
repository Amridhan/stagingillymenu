## Goal
Remove the password gate from `/admin` entirely. The dashboard becomes publicly accessible to anyone with the URL.

> Heads-up: this makes the analytics dashboard **fully public** — anyone who knows the `/admin` URL can view all session/event/device data. Confirm that's intended before I implement.

## Changes

**`src/routes/admin.tsx`**
- Drop all auth state (`authed`, `authChecking`, `loginPassword`, `loginError`, `loggingIn`) and `handleLogin`.
- Remove the `authChecking` loading screen and the `!authed` login-form branch.
- Simplify the mount effect to just call `load()` (no 401 probe).
- Remove the `if (r.status === 401) { setAuthed(false); ... }` branch in `load()`.

**`src/routes/api/admin/stats.ts` & `src/routes/api/admin/device.ts`**
- Remove `import { requireAdmin }` and the `const denied = requireAdmin(request); if (denied) return denied;` guard. Handlers serve everyone.

**Delete files** (no longer referenced):
- `src/lib/admin-auth.ts`
- `src/routes/api/admin/login.ts`
- `src/routes/api/admin/logout.ts`

The TanStack Router plugin will regenerate `routeTree.gen.ts` automatically once the login/logout route files are gone.

**Secret cleanup (optional)**
- The `ADMIN_PASSWORD` secret becomes unused. I can delete it via the secrets tool after the code change, or leave it sitting unused — your call.

## Out of scope
No changes to tracking, data model, or dashboard UI/metrics.
