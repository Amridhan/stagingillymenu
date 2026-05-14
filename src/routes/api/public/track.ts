import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/public/track")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          const body = JSON.parse(raw || "{}") as {
            action: "start" | "event" | "heartbeat";
            session_id?: string;
            device_id?: string;
            user_agent?: string;
            referrer?: string;
            screen?: string;
            language?: string;
            event_type?: string;
            target_tag?: string;
            target_id?: string;
            target_class?: string;
            target_text?: string;
            path?: string;
            data?: unknown;
          };

          const sb = admin();

          if (body.action === "start") {
            const user_agent = body.user_agent?.slice(0, 500) ?? null;
            const referrer = body.referrer?.slice(0, 500) ?? null;
            const screen = body.screen?.slice(0, 50) ?? null;
            const language = body.language?.slice(0, 20) ?? null;
            const path = body.path?.slice(0, 500) ?? null;
            const device_id = body.device_id?.slice(0, 100) ?? null;

            // Upsert device row (track first/last seen).
            if (device_id) {
              await sb.from("devices").upsert(
                { device_id, last_seen_at: new Date().toISOString() },
                { onConflict: "device_id" },
              );
            }

            const { data, error } = await sb
              .from("analytics_sessions")
              .insert({ user_agent, referrer, screen, language, device_id })
              .select("id")
              .single();
            if (error) return json({ error: error.message }, 500);
            // Also log a page_load event, once for this created session.
            await sb.from("analytics_events").insert({
              session_id: data.id,
              event_type: "page_load",
              path,
            });
            return json({ session_id: data.id });
          }

          if (!body.session_id) return json({ error: "session_id required" }, 400);

          if (body.action === "heartbeat") {
            await sb
              .from("analytics_sessions")
              .update({ last_event_at: new Date().toISOString() })
              .eq("id", body.session_id);
            return json({ ok: true });
          }

          if (body.action === "event") {
            const [{ error: e1 }] = await Promise.all([
              sb.from("analytics_events").insert({
                session_id: body.session_id,
                event_type: (body.event_type || "click").slice(0, 50),
                target_tag: body.target_tag?.slice(0, 50),
                target_id: body.target_id?.slice(0, 200),
                target_class: body.target_class?.slice(0, 300),
                target_text: body.target_text?.slice(0, 300),
                path: body.path?.slice(0, 500),
                data: body.data ?? null,
              }),
              sb
                .from("analytics_sessions")
                .update({ last_event_at: new Date().toISOString() })
                .eq("id", body.session_id),
            ]);
            if (e1) return json({ error: e1.message }, 500);
            return json({ ok: true });
          }

          return json({ error: "unknown action" }, 400);
        } catch (e) {
          return json({ error: (e as Error).message }, 500);
        }
      },
    },
  },
});
