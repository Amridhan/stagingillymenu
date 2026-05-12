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

const PW_KEY = "illy_admin_pw";
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

function AdminPage() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allSessions, setSessions] = useState<Session[]>([]);
  const [allEvents, setEvents] = useState<Event[]>([]);
  const [days, setDays] = useState(30);

  async function load(password: string, daysBack = days) {
    setLoading(true);
    setError(null);
    try {
      const from = new Date(Date.now() - daysBack * 86400000).toISOString();
      const r = await fetch("/api/admin/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, from }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setSessions(j.sessions);
      setEvents(j.events);
      setAuthed(true);
      sessionStorage.setItem(PW_KEY, password);
    } catch (e) {
      setError((e as Error).message);
      setAuthed(false);
      sessionStorage.removeItem(PW_KEY);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const saved = sessionStorage.getItem(PW_KEY);
    if (saved) {
      setPw(saved);
      load(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const sessions = allSessions.filter((s) => !EXCLUDED_SESSION_IDS.has(s.id));
    const events = allEvents.filter((e) => !EXCLUDED_SESSION_IDS.has(e.session_id));

    const pageLoads = events.filter((e) => e.event_type === "page_load");
    // "Click" metric = lightbox_open events (menu item opens)
    const clicks = events.filter((e) => e.event_type === "lightbox_open");

    // Sessions that opened at least one lightbox (menu item) — never bounces.
    const sessionsWithLightbox = new Set(
      events
        .filter((e) => e.event_type === "lightbox_open")
        .map((e) => e.session_id)
    );

    // duration per session = last_event_at - started_at
    const durations = sessions.map((s) => {
      const ms =
        new Date(s.last_event_at).getTime() - new Date(s.started_at).getTime();
      return Math.max(0, Math.round(ms / 1000));
    });
    const avgTime =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;
    // Bounce = under 10s AND no lightbox opened during the session.
    const bounces = sessions.filter((s, i) => {
      return durations[i] < BOUNCE_SECONDS && !sessionsWithLightbox.has(s.id);
    }).length;
    const bounceRate =
      sessions.length > 0
        ? Math.round((bounces / sessions.length) * 1000) / 10
        : 0;

    // page loads per day
    const byDay: Record<string, number> = {};
    for (const p of pageLoads) {
      const d = fmtDay(p.created_at);
      byDay[d] = (byDay[d] || 0) + 1;
    }
    const daySeries = Object.entries(byDay).sort(([a], [b]) =>
      a < b ? 1 : -1
    );

    // top click targets
    const targetKey = (e: Event) => {
      const txt = (e.target_text || "").trim().slice(0, 60);
      const id = e.target_id ? `#${e.target_id}` : "";
      const cls = e.target_class
        ? "." + e.target_class.split(/\s+/).slice(0, 2).join(".")
        : "";
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

    return {
      totalPageLoads: pageLoads.length,
      totalSessions: sessions.length,
      totalClicks: clicks.length,
      avgClicksPerSession:
        sessions.length > 0
          ? Math.round((clicks.length / sessions.length) * 10) / 10
          : 0,
      avgTime,
      bounceRate,
      bounces,
      daySeries,
      topClicks,
    };
  }, [allSessions, allEvents]);

  const sessions = allSessions.filter((s) => !EXCLUDED_SESSION_IDS.has(s.id));

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(pw);
          }}
          className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
        >
          <h1 className="text-xl font-semibold text-foreground">
            Admin sign in
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the shared admin password to view analytics.
          </p>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Password"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading || !pw}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

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
                load(pw, d);
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
              onClick={() => load(pw)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
            >
              {loading ? "…" : "Refresh"}
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem(PW_KEY);
                setAuthed(false);
                setPw("");
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
            >
              Sign out
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
          <Stat label="Avg clicks / session" value={stats.avgClicksPerSession} sub={`${stats.totalClicks} total`} />
          <Stat
            label="Avg time on page"
            value={`${stats.avgTime}s`}
          />
          <Stat
            label="Bounce rate"
            value={`${stats.bounceRate}%`}
            sub={`${stats.bounces} bounced`}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card title="Page loads by day">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Date</th>
                    <th className="py-2">Loads</th>
                    <th className="py-2">Bar</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.daySeries.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-4 text-muted-foreground">
                        No data yet.
                      </td>
                    </tr>
                  )}
                  {stats.daySeries.map(([d, n]) => {
                    const max = Math.max(
                      ...stats.daySeries.map(([, v]) => v as number)
                    );
                    const pct = max ? (Number(n) / max) * 100 : 0;
                    return (
                      <tr key={d} className="border-t border-border">
                        <td className="py-2">{d}</td>
                        <td className="py-2 tabular-nums">{n}</td>
                        <td className="py-2 w-1/2">
                          <div className="h-2 rounded bg-muted">
                            <div
                              className="h-2 rounded bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
        </section>

        <Card title="Recent sessions">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Started</th>
                  <th className="py-2">Duration</th>
                  <th className="py-2">Referrer</th>
                  <th className="py-2">Screen</th>
                  <th className="py-2">Lang</th>
                  <th className="py-2">User agent</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 100).map((s) => {
                  const sec = Math.max(
                    0,
                    Math.round(
                      (new Date(s.last_event_at).getTime() -
                        new Date(s.started_at).getTime()) /
                        1000
                    )
                  );
                  return (
                    <tr key={s.id} className="border-t border-border">
                      <td className="py-2 whitespace-nowrap">
                        {fmtDateTime(s.started_at)}
                      </td>
                      <td className="py-2 tabular-nums">{sec}s</td>
                      <td
                        className="py-2 truncate max-w-[200px]"
                        title={s.referrer || ""}
                      >
                        {s.referrer || "—"}
                      </td>
                      <td className="py-2">{s.screen || "—"}</td>
                      <td className="py-2">{s.language || "—"}</td>
                      <td
                        className="py-2 truncate max-w-[300px]"
                        title={s.user_agent || ""}
                      >
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

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}
