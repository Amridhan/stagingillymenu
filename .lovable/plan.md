## Scope

Single-file change in `src/routes/admin.tsx`. No changes to `public/standalone.html`, `/api/public/track`, tracking event names, session creation logic, Supabase schema, `/open-menu`, menu UI/content, or admin auth.

## 1. Launch cutoff

Add near the existing `EXCLUDED_SESSION_IDS` (line 50):

```ts
const LAUNCH_AT = "2026-05-16T12:40:00Z"; // 16 May 2026, 4:40pm GST
const LAUNCH_MS = Date.parse(LAUNCH_AT);
```

Apply inside the main `useMemo` (line 261):

- `visits` filter (line 270): also require `new Date(s.started_at).getTime() >= LAUNCH_MS`.
- After computing `events` (line 274–277): also require `new Date(e.created_at).getTime() >= LAUNCH_MS`.

Because every downstream metric (page_loads, clicks, scroll, hover, sections, items, day series, band series, recent sessions) is derived from `visits` + `events`, applying the cutoff at these two source filters propagates everywhere without further changes. Devices list is unaffected (no time-bucketed metrics).

Add a small note under the header `<p className="text-sm text-muted-foreground">` (line 617–620):

```
"Default reporting excludes test data before 16 May 2026, 4:40pm GST."
```

## 2. Session classification

In the same `useMemo`, after `timePerSession`, `endedMsPerSession`, and existing duration logic, compute per-session signals:

```ts
const isMeaningfulEngagement = (sessionId) =>
  hasEvent(sessionId, "lightbox_open") ||
  hasEvent(sessionId, "section_view") ||
  (maxScrollBySession[sessionId] ?? 0) >= 25 ||
  (sessionDurationSec(sessionId) >= 15);
```

Definitions:

- **Raw Visits** = `visits.length` (post-LAUNCH_AT, post-EXCLUDED_SESSION_IDS, day-filtered).
- **Noise / Reload Sessions** = visits where `duration < 3s` AND `!isMeaningfulEngagement`.
- **Quick Glance Sessions** = visits where `3s ≤ duration < 15s` AND no `lightbox_open` AND not noise.
- **Engaged Sessions** = visits where `lightbox_open` OR `section_view` OR `scroll ≥25%` OR `duration ≥ 15s`.
- **Valid Guest Sessions** = Raw Visits − Noise/Reload.
- **Engagement Rate** = `Engaged / Valid` (× 100, 1 decimal).
- **Quick Glance Rate** = `QuickGlance / Valid` (× 100).
- **Noise Rate** = `Noise / Raw Visits` (× 100).

Duration source: existing `sessionDuration` / `endedMsPerSession` / `timePerSession` already give per-session ms — wrap in a small helper so all classifications use the same value.

## 3. KPI cards

In the `<section>` at line 701, reorganise the top cards:

- Keep `Page loads` → relabel **"Menu Opens"**.
- Replace `Sessions` with **"Valid Guest Sessions"** = `validSessions.length`; sub = `${rawVisits} raw visits`.
- Replace `Bounce rate` card with **"Engagement Rate"**; value = `${engagementRate}%`; sub = `${engagedCount} engaged / ${validCount} valid`.
- Add small supporting cards: **"Quick Glance Rate"** (`${quickGlanceRate}%`, sub `${count} sessions`) and **"Noise / Reload"** (`${noiseCount}`, sub `${noiseRate}% of raw`).
- Keep `Avg clicks/session`, `Avg time on page`, `Avg lightbox dwell`.

Header tagline (line 619): replace `bounce = session shorter than {BOUNCE_SECONDS}s` with engagement definition summary.

`stats.bounceRate` / `stats.bounces` stay computed internally (used by per-day / per-band tables) but are no longer headline cards.

## 4. Item views

Rework the click aggregation (lines 494–525):

```ts
type ItemAgg = { name; sub; sessions: Set<string>; opens: number; dwellTotal; dwellN };
itemMap[k].sessions.add(e.session_id);
itemMap[k].opens += 1;
```

Output rows: `{ name, sub, uniqueSessions: sessions.size, totalOpens: opens, avgSec }`, sorted primarily by `uniqueSessions` desc, tiebreak `totalOpens` desc.

Update the "Menu item views" table (line 850) columns:

```
Sub Category | Item Name | Unique Interested Sessions | Total Opens | Average dwell
```

Key remains `target_class + target_text` (unchanged).

## 5. Per-day and per-time-band tables

Keep existing columns (page loads, sessions, avg time, bounce rate) for backward-compatible debugging — the spec says preserve detailed tables.

Add caption under the time-band card title:

> "Time bands aggregate activity across all selected days."

## Reporting back

After applying I will confirm:
1. File changed: `src/routes/admin.tsx` only.
2. `LAUNCH_AT` constant location (next to `EXCLUDED_SESSION_IDS`, ~line 60).
3. Exact session-classification definitions (as above).
4. Engagement Rate formula.
5. Item ranking formula (unique sessions primary, total opens secondary).
6–9. Confirmation that `standalone.html`, `/api/public/track`, Supabase schema, and tracking collection were not touched.
