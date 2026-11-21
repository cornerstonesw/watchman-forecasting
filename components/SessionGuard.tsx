"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Idle timeout (security settings, default 30 minutes): no mouse, keyboard,
// tap or scroll for that long → signed out. A "Still there?" box counts down
// the last minute. A computer that slept past the limit is signed out when it
// wakes. Closing the browser signs out too (session-only cookies).
// The data itself is protected by the database whatever happens here.

const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;
const KEY = "wf_last_activity";

export default function SessionGuard() {
  const [idleMs, setIdleMs] = useState<number | null>(null);
  const [warn, setWarn] = useState<number | null>(null);
  const last = useRef(Date.now());

  useEffect(() => {
    supabase.rpc("sign_in_options").then(({ data }) => setIdleMs((Number(data?.idle_timeout_minutes) || 30) * 60_000));
  }, []);

  useEffect(() => {
    if (!idleMs) return;
    const touch = () => {
      last.current = Date.now();
      try { localStorage.setItem(KEY, String(last.current)); } catch { /* private mode */ }
      setWarn(null);
    };
    touch();
    EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const t = window.setInterval(() => {
      // other Watchman tabs count as activity too
      let shared = last.current;
      try { shared = Math.max(shared, Number(localStorage.getItem(KEY)) || 0); } catch { /* ignore */ }
      const left = idleMs - (Date.now() - shared);
      if (left <= 0) window.location.assign("/auth/signout?reason=idle");
      else if (left <= 60_000) setWarn(Math.ceil(left / 1000));
      else setWarn(null);
    }, 1000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(t);
    };
  }, [idleMs]);

  if (warn == null) return null;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-scrim/50 backdrop-blur-sm">
      <div className="card w-80 animate-fade-up p-6 text-center shadow-pop">
        <div className="text-lg font-semibold">Still there?</div>
        <p className="mt-1 text-sm text-slate">You&rsquo;ll be signed out in <b className="tnum">{warn}</b> seconds.</p>
        <button className="btn-primary mt-4 w-full" onClick={() => setWarn(null)}>Keep me signed in</button>
      </div>
    </div>
  );
}
