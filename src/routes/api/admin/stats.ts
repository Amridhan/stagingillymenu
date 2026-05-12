import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/admin/stats")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            password: string;
            from?: string; // ISO date
            to?: string;
          };

          if (!body.password || body.password !== process.env.ADMIN_PASSWORD) {
            return json({ error: "Unauthorized" }, 401);
          }

          const sb = admin();
          const from =
            body.from ||
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const to = body.to || new Date().toISOString();

          const [sessionsRes, eventsRes] = await Promise.all([
            sb
              .from("analytics_sessions")
              .select("id, started_at, last_event_at, user_agent, referrer, screen, language")
              .gte("started_at", from)
              .lte("started_at", to)
              .order("started_at", { ascending: false })
              .limit(5000),
            sb
              .from("analytics_events")
              .select("id, session_id, event_type, target_tag, target_id, target_class, target_text, path, data, created_at")
              .gte("created_at", from)
              .lte("created_at", to)
              .order("created_at", { ascending: false })
              .limit(10000),
          ]);

          if (sessionsRes.error) return json({ error: sessionsRes.error.message }, 500);
          if (eventsRes.error) return json({ error: eventsRes.error.message }, 500);

          return json({
            sessions: sessionsRes.data ?? [],
            events: eventsRes.data ?? [],
          });
        } catch (e) {
          return json({ error: (e as Error).message }, 500);
        }
      },
    },
  },
});
