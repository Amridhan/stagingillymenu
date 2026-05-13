import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

type Session = {
  id: string;
  started_at: string;
  last_event_at: string;
  user_agent: string | null;
  referrer: string | null;
  screen: string | null;
  language: string | null;
};
type Event = {
  id: number;
  session_id: string;
  event_type: string;
  target_tag: string | null;
  target_id: string | null;
  target_class: string | null;
  target_text: string | null;
  path: string | null;
  data: unknown;
  created_at: string;
};

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · Analytics" }] }),
  component: AdminPage,
});

const BOUNCE_SECONDS = 10;

const TZ = "Asia/Dubai"; // Gulf Standard Time (UTC+4)
const EXCLUDED_SESSION_IDS = new Set<string>([
  "f67aa4c3-08f5-4dda-81e6-2749fb7d5faa", // synthetic debug session
  "b8bb10c9-977a-46b0-b29d-d7140b913cdd",
  "75075df0-286e-440e-a56d-da352622f0fb",
  "25e67c8a-89ca-4ee1-9384-6157ce0d9bd1",
  "8be0256a-0e71-491e-9a4d-d2890f1ccb47",
  "040b8319-fd5c-470e-b4f9-813c5b9a6f38",
  "173b9e63-9a7f-43ff-89cf-eebccf6e4701",
  "9e974077-1a82-4f4e-b484-ea72e98ecf42",
]);

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}); // yields YYYY-MM-DD in GST
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const fmtDay = (iso: string) => dayFmt.format(new Date(iso));
const fmtDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

const dowFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
});
const dayOfWeek = (yyyymmdd: string) => dowFmt.format(new Date(`${yyyymmdd}T12:00:00Z`)); // UTC noon = 4pm GST, same date

const hmFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const gstMinutesOfDay = (iso: string) => {
  const [h, m] = hmFmt.format(new Date(iso)).split(":").map(Number);
  return h * 60 + m;
};

const fmtMSS = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

type Band = { label: string; test: (min: number) => boolean };

const TIME_BANDS: Band[] = [
  { label: "9:00am – 12:00pm", test: (m) => m >= 540 && m < 720 },
  { label: "12:00pm – 3:30pm", test: (m) => m >= 720 && m < 930 },
  { label: "3:30pm – 7:30pm", test: (m) => m >= 930 && m < 1170 },
  { label: "7:30pm – 10:30pm", test: (m) => m >= 1170 && m < 1350 },
  { label: "10:30pm – 12:30am", test: (m) => m >= 1350 || m < 30 },
];

function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allSessions, setSessions] = useState<Session[]>([]);
  const [allEvents, setEvents] = useState<Event[]>([]);
  const [days, setDays] = useState(30);

  async function load(daysBack = days) {
    setLoading(true);
    setError(null);
    try {
      const from = new Date(Date.now() - daysBack * 86400000).toISOString();
      const r = await fetch("/api/admin/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setSessions(j.sessions);
      setEvents(j.events);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { stats, sessions, sessionDuration } = useMemo(() => {
    const visits = allSessions.filter((s) => !EXCLUDED_SESSION_IDS.has(s.id));
    const events = allEvents.filter((e) => !EXCLUDED_SESSION_IDS.has(e.session_id));

    const pageLoads = events.filter((e) => e.event_type === "page_load");
    const clicks = events.filter((e) => e.event_type === "lightbox_open"); // "click" = lightbox open
    const timeEvents = events.filter((e) => e.event_type === "time_on_page");

    // Best recorded visible-time per session (ms). Sessions without a
    // time_on_page event have no entry here.
    const timePerSession: Record<string, number> = {};
    for (const e of timeEvents) {
      const ms = (e.data as { ms?: number } | null)?.ms ?? 0;
      if (!timePerSession[e.session_id] || ms > timePerSession[e.session_id]) {
        timePerSession[e.session_id] = ms;
      }
    }

    // Effective duration per session (sec). Prefers time_on_page; falls back
    // to last_event_at − started_at when no time event was recorded.
    const sessionDuration: Record<string, number> = {};
    for (const s of visits) {
      const fromTime = timePerSession[s.id];
      if (fromTime != null) {
        sessionDuration[s.id] = Math.max(0, Math.round(fromTime / 1000));
      } else {
        sessionDuration[s.id] = Math.max(
          0,
          Math.round(
            (new Date(s.last_event_at).getTime() - new Date(s.started_at).getTime()) / 1000,
          ),
        );
      }
    }

    // Sessions that opened at least one lightbox — never bounces.
    const sessionsWithLightbox = new Set(clicks.map((e) => e.session_id));

    // Bounce: shorter than threshold AND no lightbox opened.
    const bouncedIds = new Set<string>();
    for (const s of visits) {
      const sec = sessionDuration[s.id] ?? 0;
      if (sec < BOUNCE_SECONDS && !sessionsWithLightbox.has(s.id)) {
        bouncedIds.add(s.id);
      }
    }
    const bounces = bouncedIds.size;

    // "Sessions" metric = every session that did NOT bounce.
    const sessions = visits.filter((s) => !bouncedIds.has(s.id));

    // Avg time on page = average of time_on_page across sessions that
    // recorded one (any session, bounced or not).
    const timeValues = Object.values(timePerSession);
    const avgTimeOnPage =
      timeValues.length > 0
        ? Math.round(timeValues.reduce((a, b) => a + b, 0) / timeValues.length / 1000)
        : 0;

    const bounceRate = visits.length > 0 ? Math.round((bounces / visits.length) * 1000) / 10 : 0;

    // Per-bucket helper.
    const buildBucket = (loads: number, sessList: Session[], bouncedCount: number) => {
      const durs = sessList
        .map((s) => timePerSession[s.id])
        .filter((v): v is number => v != null);
      const avg =
        durs.length > 0
          ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length / 1000)
          : null;
      const totalSess = sessList.length + bouncedCount;
      const br = totalSess > 0 ? Math.round((bouncedCount / totalSess) * 1000) / 10 : null;
      return { loads, sessions: sessList.length, avgTime: avg, bounceRate: br };
    };

    // ----- Per day -----
    const loadsByDay: Record<string, number> = {};
    for (const p of pageLoads) {
      const d = fmtDay(p.created_at);
      loadsByDay[d] = (loadsByDay[d] || 0) + 1;
    }
    const sessByDay: Record<string, Session[]> = {};
    for (const s of sessions) {
      const d = fmtDay(s.started_at);
      (sessByDay[d] ||= []).push(s);
    }
    const bouncedByDay: Record<string, number> = {};
    for (const s of visits) {
      if (!bouncedIds.has(s.id)) continue;
      const d = fmtDay(s.started_at);
      bouncedByDay[d] = (bouncedByDay[d] || 0) + 1;
    }
    const allDays = new Set<string>([
      ...Object.keys(loadsByDay),
      ...Object.keys(sessByDay),
      ...Object.keys(bouncedByDay),
    ]);
    const daySeries = Array.from(allDays)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((d) => ({
        day: d,
        dow: dayOfWeek(d),
        ...buildBucket(loadsByDay[d] || 0, sessByDay[d] || [], bouncedByDay[d] || 0),
      }));

    // ----- Per time band -----
    const bandSeries = TIME_BANDS.map((b) => {
      const loads = pageLoads.filter((p) => b.test(gstMinutesOfDay(p.created_at))).length;
      const sessList = sessions.filter((s) => b.test(gstMinutesOfDay(s.started_at)));
      const bouncedCount = visits.filter(
        (s) => bouncedIds.has(s.id) && b.test(gstMinutesOfDay(s.started_at)),
      ).length;
      return { label: b.label, ...buildBucket(loads, sessList, bouncedCount) };
    });

    // top click targets
    const targetKey = (e: Event) => {
      const txt = (e.target_text || "").trim().slice(0, 60);
      const id = e.target_id ? `#${e.target_id}` : "";
      const cls = e.target_class ? "." + e.target_class.split(/\s+/).slice(0, 2).join(".") : "";
      const tag = e.target_tag || "?";
      return `${tag}${id}${cls}${txt ? ` — "${txt}"` : ""}`;
    };
    const clickCounts: Record<string, number> = {};
    for (const c of clicks) {
      const k = targetKey(c);
      clickCounts[k] = (clickCounts[k] || 0) + 1;
    }
    const topClicks = Object.entries(clickCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25);

    // ---- Other event types ----
    const scrollEvents = events.filter((e) => e.event_type === "scroll_depth");
    const hoverEvents = events.filter((e) => e.event_type === "hover");
    const sectionEvents = events.filter((e) => e.event_type === "section_view");
    const closeEvents = events.filter((e) => e.event_type === "lightbox_close");

    const scrollByThreshold: Record<string, Set<string>> = {
      "25": new Set(),
      "50": new Set(),
      "75": new Set(),
      "100": new Set(),
    };
    for (const e of scrollEvents) {
      const t = e.target_id || "";
      if (scrollByThreshold[t]) scrollByThreshold[t].add(e.session_id);
    }
    const scrollDepth = ["25", "50", "75", "100"].map((t) => ({
      threshold: t,
      sessions: scrollByThreshold[t].size,
      pct:
        sessions.length > 0
          ? Math.round((scrollByThreshold[t].size / sessions.length) * 1000) / 10
          : 0,
    }));

    const hoverCounts: Record<string, number> = {};
    for (const e of hoverEvents) {
      const k = (e.target_text || "?").trim().slice(0, 60);
      hoverCounts[k] = (hoverCounts[k] || 0) + 1;
    }
    const topHovers = Object.entries(hoverCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25);

    const sectionByKey: Record<string, { title: string; sessions: Set<string> }> = {};
    for (const e of sectionEvents) {
      const id = e.target_id || "?";
      if (!sectionByKey[id]) sectionByKey[id] = { title: e.target_text || id, sessions: new Set() };
      sectionByKey[id].sessions.add(e.session_id);
    }
    const sectionSeries = Object.entries(sectionByKey)
      .map(([id, v]) => ({
        id,
        title: v.title,
        sessions: v.sessions.size,
        pct: sessions.length > 0 ? Math.round((v.sessions.size / sessions.length) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    const dwellByItem: Record<string, { name: string; total: number; n: number }> = {};
    let dwellTotal = 0;
    let dwellN = 0;
    for (const e of closeEvents) {
      const ms = (e.data as { dwell_ms?: number } | null)?.dwell_ms ?? 0;
      if (ms <= 0) continue;
      dwellTotal += ms;
      dwellN += 1;
      const k = (e.target_text || "?").trim().slice(0, 60);
      if (!dwellByItem[k]) dwellByItem[k] = { name: k, total: 0, n: 0 };
      dwellByItem[k].total += ms;
      dwellByItem[k].n += 1;
    }
    const avgLightboxDwell = dwellN > 0 ? Math.round(dwellTotal / dwellN / 1000) : 0;
    const topDwell = Object.values(dwellByItem)
      .map((d) => ({ name: d.name, avgSec: Math.round(d.total / d.n / 1000), opens: d.n }))
      .sort((a, b) => b.avgSec - a.avgSec)
      .slice(0, 25);

    return {
      stats: {
        totalPageLoads: pageLoads.length,
        totalSessions: sessions.length,
        totalClicks: clicks.length,
        avgClicksPerSession:
          sessions.length > 0 ? Math.round((clicks.length / sessions.length) * 10) / 10 : 0,
        avgTimeOnPage,
        avgLightboxDwell,
        bounceRate,
        bounces,
        daySeries,
        bandSeries,
        topClicks,
        scrollDepth,
        topHovers,
        sectionSeries,
        topDwell,
      },
      sessions,
      sessionDuration,
    };
  }, [allSessions, allEvents]);

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Menu Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Last {days} days · bounce = session shorter than {BOUNCE_SECONDS}s
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => {
                const d = Number(e.target.value);
                setDays(d);
                load(d);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value={1}>Last 24h</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
            <button
              onClick={() => load()}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
            >
              {loading ? "…" : "Refresh"}
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Page loads" value={stats.totalPageLoads} />
          <Stat label="Sessions" value={stats.totalSessions} />
          <Stat
            label="Avg clicks / session"
            value={stats.avgClicksPerSession}
            sub={`${stats.totalClicks} total`}
          />
          <Stat
            label="Avg time on page"
            value={fmtMSS(stats.avgTimeOnPage)}
            sub={stats.avgTimeOnPage ? "from time_on_page" : "no data yet"}
          />
          <Stat
            label="Bounce rate"
            value={`${stats.bounceRate}%`}
            sub={`${stats.bounces} bounced`}
          />
          <Stat
            label="Avg lightbox dwell"
            value={fmtMSS(stats.avgLightboxDwell)}
            sub="time inside popups"
          />
        </section>

        <Card title="Top hovered items (≥500ms dwell, deduped per session)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Hovers</th>
                </tr>
              </thead>
              <tbody>
                {stats.topHovers.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-4 text-muted-foreground">
                      No hovers yet (touch devices have no hover).
                    </td>
                  </tr>
                )}
                {stats.topHovers.map(([k, n]) => (
                  <tr key={k} className="border-t border-border">
                    <td className="py-2 truncate max-w-[420px]" title={k}>
                      {k}
                    </td>
                    <td className="py-2 text-right tabular-nums">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Lightbox dwell — top items by avg time inside popup">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Avg dwell</th>
                  <th className="py-2 text-right">Opens</th>
                </tr>
              </thead>
              <tbody>
                {stats.topDwell.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-muted-foreground">
                      No lightbox closes yet.
                    </td>
                  </tr>
                )}
                {stats.topDwell.map((r) => (
                  <tr key={r.name} className="border-t border-border">
                    <td className="py-2 truncate max-w-[420px]" title={r.name}>
                      {r.name}
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmtMSS(r.avgSec)}</td>
                    <td className="py-2 text-right tabular-nums">{r.opens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Per day">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Date</th>
                  <th className="py-2">Day</th>
                  <th className="py-2 text-right">Page loads</th>
                  <th className="py-2 text-right">Sessions</th>
                  <th className="py-2 text-right">Avg time</th>
                  <th className="py-2 text-right">Bounce rate</th>
                </tr>
              </thead>
              <tbody>
                {stats.daySeries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-muted-foreground">
                      No data yet.
                    </td>
                  </tr>
                )}
                {stats.daySeries.map((row) => (
                  <tr key={row.day} className="border-t border-border">
                    <td className="py-2 whitespace-nowrap">{row.day}</td>
                    <td className="py-2 text-muted-foreground">{row.dow}</td>
                    <td className="py-2 tabular-nums text-right">{row.loads}</td>
                    <td className="py-2 tabular-nums text-right">{row.sessions}</td>
                    <td className="py-2 tabular-nums text-right">
                      {row.avgTime == null ? "—" : fmtMSS(row.avgTime)}
                    </td>
                    <td className="py-2 tabular-nums text-right">
                      {row.bounceRate == null ? "—" : `${row.bounceRate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="By time of day (GST)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Time band</th>
                  <th className="py-2 text-right">Page loads</th>
                  <th className="py-2 text-right">Sessions</th>
                  <th className="py-2 text-right">Avg time</th>
                  <th className="py-2 text-right">Bounce rate</th>
                </tr>
              </thead>
              <tbody>
                {stats.bandSeries.map((row) => (
                  <tr key={row.label} className="border-t border-border">
                    <td className="py-2 whitespace-nowrap">{row.label}</td>
                    <td className="py-2 tabular-nums text-right">{row.loads}</td>
                    <td className="py-2 tabular-nums text-right">{row.sessions}</td>
                    <td className="py-2 tabular-nums text-right">
                      {row.avgTime == null ? "—" : fmtMSS(row.avgTime)}
                    </td>
                    <td className="py-2 tabular-nums text-right">
                      {row.bounceRate == null ? "—" : `${row.bounceRate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Top clicked elements">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Element</th>
                  <th className="py-2 text-right">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {stats.topClicks.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-4 text-muted-foreground">
                      No clicks yet.
                    </td>
                  </tr>
                )}
                {stats.topClicks.map(([k, n]) => (
                  <tr key={k} className="border-t border-border">
                    <td className="py-2 truncate max-w-[420px]" title={k}>
                      {k}
                    </td>
                    <td className="py-2 text-right tabular-nums">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Recent sessions">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Started</th>
                  <th className="py-2">Duration</th>
                  <th className="py-2">Referrer</th>
                  <th className="py-2">Screen</th>

                  <th className="py-2">User agent</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 100).map((s) => {
                  const sec = sessionDuration[s.id] ?? 0;
                  return (
                    <tr key={s.id} className="border-t border-border">
                      <td className="py-2 whitespace-nowrap">{fmtDateTime(s.started_at)}</td>
                      <td className="py-2 tabular-nums">{sec}s</td>
                      <td className="py-2 truncate max-w-[200px]" title={s.referrer || ""}>
                        {s.referrer || "—"}
                      </td>
                      <td className="py-2">{s.screen || "—"}</td>

                      <td className="py-2 truncate max-w-[300px]" title={s.user_agent || ""}>
                        {s.user_agent || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}
