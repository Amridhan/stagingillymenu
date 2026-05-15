import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/open-menu")({
  head: () => ({
    meta: [
      { title: "illy Caffè — Menu" },
      { name: "description", content: "illy Caffè interactive menu." },
    ],
  }),
  component: OpenMenu,
});

const DEVICE_KEY = "aycilly.analytics.device.v1";
const COOKIE_NAME = "aycilly_analytics_device";

function getCookieDeviceId(): string | null {
  const m = document.cookie.match(/(?:^|; )aycilly_analytics_device=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function setCookieDeviceId(id: string) {
  document.cookie =
    COOKIE_NAME +
    "=" +
    encodeURIComponent(id) +
    "; Max-Age=31536000; Path=/; SameSite=Lax; Secure";
}
function readOrCreateDeviceId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_KEY) || getCookieDeviceId();
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    }
    localStorage.setItem(DEVICE_KEY, id);
    setCookieDeviceId(id);
  } catch {
    id = getCookieDeviceId();
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      setCookieDeviceId(id);
    }
  }
  return id;
}

function OpenMenu() {
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const tapsRef = useRef<number[]>([]);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = readOrCreateDeviceId();
    setPairCode(id.replace(/-/g, "").slice(0, 8).toUpperCase());
    const isPair = new URLSearchParams(window.location.search).get("pair") === "1";
    if (isPair) setRevealed(true);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleHiddenTap = () => {
    const now = Date.now();
    const recent = tapsRef.current.filter((t) => now - t < 5000);
    recent.push(now);
    tapsRef.current = recent;
    if (recent.length >= 5) {
      tapsRef.current = [];
      setRevealed(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setRevealed(false), 120000);
    }
  };

  return (
    <>
      <iframe
        src="/standalone.html"
        title="illy Caffè Menu"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          border: 0,
        }}
      />
      <div
        onClick={handleHiddenTap}
        onTouchStart={handleHiddenTap}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 80,
          height: 64,
          background: "transparent",
          zIndex: 2147483646,
        }}
      />
      {pairCode && revealed && (
        <div
          style={{
            position: "fixed",
            right: 12,
            bottom: 12,
            padding: "8px 12px",
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            font: "600 13px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace",
            letterSpacing: "0.04em",
            borderRadius: 8,
            pointerEvents: "none",
            zIndex: 2147483647,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        >
          Device Code: {pairCode}
        </div>
      )}
    </>
  );
}